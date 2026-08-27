/**
 * Checks that each song is actually one the artist recorded.
 *
 *   node scripts/verify/songs.js               # report only
 *   node scripts/verify/songs.js --unpublish   # also take the unmatched off the site
 *
 * The catalogue was built partly from MusicBrainz and partly from titles typed
 * from memory. The typed ones carried real mistakes — "Kafana na Balkanu" was
 * filed under Aco Pejović when it is Aca Lukas's — and a songbook that gets the
 * attribution wrong is worse than one that is smaller.
 *
 * AI-DECISION: matching is against *recordings*, not works. A songbook cares
 * that the artist sang it, not that they wrote it — half this repertoire is
 * other people's songs sung well, and a writer-only check would reject almost
 * all of it.
 *
 * AI-NOTE: --unpublish sets status to draft. It never deletes: "MusicBrainz has
 * no recording under this title" and "this song does not exist" are different
 * statements, and the second one needs a person.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { env } from '../../src/config/env.js';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import { recordingsOf, pause, fold } from '../lib/musicbrainz.js';

const unpublish = process.argv.includes('--unpublish');

await mongoose.connect(env.MONGODB_URI);

// Only artists that have been matched to a MusicBrainz record: without an id
// there is nothing to check against, and guessing by name is what produced the
// wrong attributions in the first place.
const artists = await Artist.find({ mbid: { $ne: null } }).sort({ name: 1 });
console.log(`  provjeravam pjesme za ${artists.length} izvodjaca${unpublish ? ' (sa skidanjem s objave)' : ''}\n`);

const report = { artists: 0, songs: 0, matched: 0, unmatched: [], skipped: [] };

for (const [i, artist] of artists.entries()) {
  const songs = await Song.find({ artist: artist._id }, { title: 1, slug: 1, status: 1 });
  if (!songs.length) continue;

  let known;
  try {
    known = await recordingsOf(artist.mbid);
  } catch (err) {
    report.skipped.push({ artist: artist.name, reason: err.message });
    console.log(`  ${String(i + 1).padStart(3)}. ${artist.name.padEnd(24)} PRESKOCEN (${err.message.slice(0, 40)})`);
    continue;
  }

  report.artists += 1;

  // An artist MusicBrainz has no recordings for proves nothing about our songs.
  if (!known.size) {
    report.skipped.push({ artist: artist.name, reason: 'nema snimaka na MusicBrainzu' });
    console.log(`  ${String(i + 1).padStart(3)}. ${artist.name.padEnd(24)} nema snimaka na MB — preskacem ${songs.length}`);
    continue;
  }

  const missing = [];
  for (const song of songs) {
    report.songs += 1;
    if (known.has(fold(song.title))) { report.matched += 1; continue; }
    missing.push(song);
  }

  if (missing.length) {
    report.unmatched.push({
      artist: artist.name,
      mbid: artist.mbid,
      knownTitles: known.size,
      songs: missing.map((s) => ({ title: s.title, slug: s.slug }))
    });

    if (unpublish) {
      await Song.updateMany({ _id: { $in: missing.map((s) => s._id) } }, { status: 'draft' });
    }
  }

  const flag = missing.length ? `  ⚠ ${missing.length} bez potvrde` : '';
  console.log(`  ${String(i + 1).padStart(3)}. ${artist.name.padEnd(24)} ${String(songs.length - missing.length).padStart(3)}/${String(songs.length).padEnd(3)} potvrdjeno  (MB zna ${known.size})${flag}`);

  await pause(1100);
}

writeFileSync(new URL('songs-report.json', import.meta.url), JSON.stringify(report, null, 2));

const pct = report.songs ? Math.round((report.matched / report.songs) * 100) : 0;
console.log('');
console.log(`  izvodjaca ${report.artists}   pjesama ${report.songs}   potvrdjeno ${report.matched} (${pct}%)`);
console.log(`  bez potvrde ${report.songs - report.matched}   preskoceno izvodjaca ${report.skipped.length}`);
if (!unpublish) console.log('  (ništa nije promijenjeno — pokreni sa --unpublish)');
await mongoose.disconnect();
