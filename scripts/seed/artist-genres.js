/**
 * Fills in each artist's genres from the songs they actually have.
 *
 *   node scripts/seed/artist-genres.js           # report only
 *   node scripts/seed/artist-genres.js --apply
 *
 * AI-DECISION: derived, not typed. `Artist.genres` is editable in the dashboard
 * and had been left empty on all 137 — which made the genre filter on the public
 * artists page a control that could only ever return nothing. An artist's genres
 * are not independent information: they are what their songs are. Deriving them
 * gets the filter working today and keeps it honest as the catalogue grows.
 *
 * Only published songs count, so the public filter agrees with the public list.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../../src/config/env.js';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';

const APPLY = process.argv.includes('--apply');

const rows = await (async () => {
  await mongoose.connect(env.MONGODB_URI);
  return Song.aggregate([
    { $match: { status: 'published', genres: { $ne: [] } } },
    { $unwind: '$genres' },
    { $group: { _id: '$artist', genres: { $addToSet: '$genres' } } }
  ]);
})();

let changed = 0;
for (const row of rows) {
  // No populate: comparing ids is enough, and populating would need the
  // Genre model registered for a value this never reads.
  const artist = await Artist.findById(row._id);
  if (!artist) continue;

  const before = (artist.genres || []).map(String).sort().join(',');
  const after = row.genres.map(String).sort().join(',');
  if (before === after) continue;

  changed++;
  if (APPLY) {
    artist.genres = row.genres;
    await artist.save();
  }
}

console.log(`  izvođača sa pjesmama: ${rows.length}`);
console.log(`  ${APPLY ? 'ažurirano' : 'za ažuriranje'}: ${changed}`);
if (!APPLY) console.log('\n  probni hod — pokreni s --apply da se upiše');

await mongoose.disconnect();
