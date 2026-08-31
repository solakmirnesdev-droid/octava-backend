/**
 * Recomputes what is derived, and reports what is not.
 *
 *   node scripts/maintenance/doctor.js          # report only
 *   node scripts/maintenance/doctor.js --write  # repair the derived fields
 *
 * AI-DECISION: the line between the two halves is whether a repair can be
 * wrong. searchTitle, the chord list, searchLyrics and the genre counters are
 * all functions of data already stored — recomputing them destroys nothing and
 * the answer is the same every time. Duplicates and orphans are not: choosing
 * which of two copies to keep, or whether an unreachable song should be deleted
 * or reassigned, is a judgement, and a script that guesses at it quietly loses
 * work somebody did.
 *
 * AI-NOTE: derived fields drift because writes reach the catalogue by more
 * paths than the pre-validate hook — bulk writes and updateOne skip it
 * entirely. That is not a bug to fix by removing the paths; it is the reason
 * this script needs to exist and be run.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import Genre from '../../src/models/Genre.js';
import { extractChords } from '../../src/utils/chords.js';
import { tidyContent } from '../../src/utils/tidyContent.js';
import { slugify } from '../../src/utils/slug.js';

const WRITE = process.argv.includes('--write');
await mongoose.connect(process.env.MONGODB_URI);

const lyricsOf = (arrangements) => (arrangements || [])
  .filter((a) => !a.deletedAt)
  .map((a) => a.content || '')
  .join('\n')
  .replace(/\[[^\]]*\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 20000);

const counts = { title: 0, chords: 0, lyrics: 0, content: 0, tags: 0 };
let batch = [];

for await (const song of Song.find().select('title searchTitle searchLyrics arrangements tags').lean().cursor()) {
  const set = {};

  const title = slugify(song.title).replace(/-/g, ' ');
  if ((song.searchTitle || '') !== title) { set.searchTitle = title; counts.title += 1; }

  const arrangements = (song.arrangements || []).map((a) => {
    const content = tidyContent(a.content);
    return { ...a, content, chords: extractChords(content) };
  });

  if (arrangements.some((a, i) => a.content !== song.arrangements[i].content)) counts.content += 1;
  if (arrangements.some((a, i) => JSON.stringify(a.chords) !== JSON.stringify(song.arrangements[i].chords || []))) {
    counts.chords += 1;
  }
  if (arrangements.length) set.arrangements = arrangements;

  /*
   * The `bez-akorda` tag is a claim about the chords, so it is derived like
   * everything else here — and it is the tag the dashboard's work queue filters
   * on. Left stale it offers work that is already done: 593 songs carried it
   * while holding chords somebody had since added.
   */
  const hasChords = arrangements.some((a) => !a.deletedAt && (a.chords || []).length);
  const tags = song.tags || [];
  if (hasChords && tags.includes('bez-akorda')) {
    set.tags = tags.filter((t) => t !== 'bez-akorda');
    counts.tags += 1;
  } else if (!hasChords && !tags.includes('bez-akorda')) {
    set.tags = [...tags, 'bez-akorda'];
    counts.tags += 1;
  }

  const lyrics = lyricsOf(arrangements);
  if ((song.searchLyrics || '') !== lyrics) { set.searchLyrics = lyrics; counts.lyrics += 1; }

  if (WRITE && Object.keys(set).length) {
    batch.push({ updateOne: { filter: { _id: song._id }, update: { $set: set } } });
    if (batch.length >= 500) { await Song.bulkWrite(batch, { ordered: false }); batch = []; }
  }
}
if (batch.length) await Song.bulkWrite(batch, { ordered: false });

// Counters, recomputed rather than adjusted: a delta is only right if every
// past delta was.
let genres = 0;
for (const g of await Genre.find().select('_id songCount').lean()) {
  const n = await Song.countDocuments({ genres: g._id });
  if ((g.songCount || 0) !== n) {
    genres += 1;
    if (WRITE) await Genre.updateOne({ _id: g._id }, { songCount: n });
  }
}

let artists = 0;
for (const a of await Artist.find().select('_id songCount').lean()) {
  const n = await Song.countDocuments({ artist: a._id });
  if ((a.songCount || 0) !== n) {
    artists += 1;
    if (WRITE) await Artist.updateOne({ _id: a._id }, { songCount: n });
  }
}

// ── the half that needs a person ───────────────────────────────────────────
const living = new Set((await Artist.find().select('_id').lean()).map((a) => String(a._id)));
const orphans = (await Song.find().select('artist').lean()).filter((s) => !living.has(String(s.artist))).length;

const duplicates = await Song.aggregate([
  { $group: { _id: { t: '$searchTitle', a: '$artist' }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
  { $count: 'groups' }
]);

console.log('\n  POPRAVLJIVO (izvedeno iz postojecih podataka)');
console.log('    searchTitle          ', counts.title);
console.log('    spisak akorada       ', counts.chords);
console.log('    searchLyrics         ', counts.lyrics);
console.log('    razmaci u sadrzaju   ', counts.content);
console.log('    tag bez-akorda       ', counts.tags);
console.log('    brojaci zanrova      ', genres);
console.log('    brojaci izvodjaca    ', artists);

console.log('\n  TRAZI ODLUKU (skripta ne dira)');
console.log('    pjesme bez izvodjaca ', orphans);
console.log('    duplikat grupa       ', duplicates[0]?.groups || 0);

const sharedVideos = await Song.aggregate([
  { $match: { youtubeId: { $nin: [null, ''] } } },
  { $group: { _id: '$youtubeId', n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
  { $count: 'ids' }
]);
const sameName = await Artist.aggregate([
  { $group: { _id: '$searchName', n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
  { $count: 'names' }
]);
console.log('    isti video vise pjesama', sharedVideos[0]?.ids || 0);
console.log('    isto ime vise izvodjaca', sameName[0]?.names || 0);

if (!WRITE) console.log('\n  (probni prolaz — nista nije upisano; dodaj --write)\n');
else console.log('\n  popravljeno.\n');

await mongoose.disconnect();
