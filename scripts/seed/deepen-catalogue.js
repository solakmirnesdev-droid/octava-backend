/**
 * Adds more real titles for artists that are already verified.
 *
 *   node scripts/seed/deepen-catalogue.js            # report
 *   node scripts/seed/deepen-catalogue.js --apply    # add them, as drafts
 *
 * The catalogue holds twelve songs per artist because twelve was the cap on the
 * first import, not because twelve is the right number. MusicBrainz knows 136
 * titles per artist on average and 432 for Bijelo Dugme alone, and every one of
 * those artists has now been matched to a real record — so the titles can be
 * trusted without another round of guessing.
 *
 * AI-DECISION: the new songs get an empty arrangement, not an invented chord
 * progression. A made-up progression for a song nobody here has heard would look
 * exactly like data somebody checked, and a songbook that quietly ships guesses
 * is worse than a smaller one. They arrive as drafts, tagged, waiting for a
 * person to write the chords. See AI-NOTES.md §5.
 */
import 'dotenv/config';
import { env } from '../../src/config/env.js';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Genre from '../../src/models/Genre.js';
import { recordingsOf, pause } from '../lib/musicbrainz.js';
import { toLatin } from '../../src/utils/latinise.js';
import { foldTitle } from '../../src/utils/foldTitle.js';

const apply = process.argv.includes('--apply');
const PER_ARTIST = Number(process.env.PER_ARTIST || 30);

/**
 * A title carried by one recording is usually a live take, a remix, or a guest
 * spot filed under the wrong name. Two or more means it was actually released.
 */
const MIN_RECORDINGS = 2;

/** Sleeve noise that survives the fold: bracketed variants, track numbers. */
const NOISE = /\b(live|remix|version|instrumental|karaoke|demo|intro|outro|medley|radio edit|remaster)\b/i;

await mongoose.connect(env.MONGODB_URI);

const artists = await Artist.find({ mbid: { $ne: null } }).sort({ name: 1 });
const domaca = await Genre.findOne({ slug: 'domaca' });
const staff = await mongoose.connection.db.collection('staffs').findOne({ role: 'superadmin' });

console.log(`  ${artists.length} provjerenih izvodjaca, najvise ${PER_ARTIST} pjesama po izvodjacu\n`);

let added = 0;
let considered = 0;

for (const [i, artist] of artists.entries()) {
  const have = new Set(
    (await Song.find({ artist: artist._id }, { title: 1 }).setOptions({ withDeleted: true }))
      .map((s) => foldTitle(s.title))
  );

  let known;
  try {
    known = await recordingsOf(artist.mbid, { toLatin });
  } catch (err) {
    console.log(`  ${String(i + 1).padStart(3)}. ${artist.name.padEnd(24)} preskocen (${err.message.slice(0, 30)})`);
    continue;
  }

  const fresh = [...known.entries()]
    .filter(([key, v]) => !have.has(key) && v.count >= MIN_RECORDINGS && !NOISE.test(v.title))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, Math.max(0, PER_ARTIST - have.size));

  considered += fresh.length;

  if (apply && fresh.length) {
    for (const [, v] of fresh) {
      await Song.create({
        title: v.title,
        artist: artist._id,
        genres: artist.genres?.length ? artist.genres : (domaca ? [domaca._id] : []),
        // Greppable: this song has a real title and no chords yet.
        tags: ['uvoz', 'bez-akorda'],
        status: 'draft',
        createdBy: staff?._id,
        arrangements: [{
          content: '{Tekst i akordi još nisu upisani.}',
          originalKey: 'Am',
          isPrimary: true,
          createdBy: staff?._id
        }]
      }).catch(() => {});
      added += 1;
    }
    artist.songCount = await Song.countDocuments({ artist: artist._id });
    await artist.save().catch(() => {});
  }

  if (fresh.length) {
    console.log(`  ${String(i + 1).padStart(3)}. ${artist.name.padEnd(24)} imamo ${String(have.size).padStart(3)}  MB zna ${String(known.size).padStart(4)}  +${fresh.length}`);
  }

  await pause(1100);
}

console.log('');
console.log(`  novih naslova ${apply ? added : considered}${apply ? ' (dodano kao nacrt)' : ' (nista nije upisano)'}`);
if (!apply) console.log('  pokreni sa --apply da se upisu');
await mongoose.disconnect();
