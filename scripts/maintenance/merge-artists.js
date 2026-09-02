/**
 * Merges artists that are the same person stored twice.
 *
 *   node scripts/maintenance/merge-artists.js            # proposal, nothing is written
 *   node scripts/maintenance/merge-artists.js --write
 *
 * The catalogue holds 228 groups where two or more Artist rows share one
 * searchName — the very field the app compares names by, so it already cannot
 * tell them apart: Đani / Djani, Nataša Bekvalac / Natasa Bekvalac,
 * Željko Šasić / Željko Šašić.
 *
 * AI-DECISION: the survivor is the one spelled correctly, NOT the one holding
 * the songs. In this catalogue the songs frequently sit on the misspelled row —
 * Željko Šasić has eight and Željko Šašić has none — and Mirnes asked for
 * names without spelling errors. Picking by song count would have preserved
 * the typo and thrown away the correct name. Diacritics decide it: stripping
 * č, ć, š, ž, đ is how these duplicates are born, so the richer spelling is the
 * original. See CATALOG.md §7.
 *
 * AI-NOTE: losers are soft-deleted, never removed. They land in the same trash
 * as everything else and can be restored from the dashboard.
 *
 * AI-TRAP: once merged, this still reports 227 duplicate groups and 0 merges,
 * and that is correct — it is not a broken run. `Artist.aggregate` ignores the
 * `pre(SCOPED)` soft-delete hook in the model and so counts the trashed losers,
 * while the `Artist.find` below obeys it and returns only the survivor. The
 * group count is therefore historical; `merged` is the number that matters.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import { connect } from '../lib/sweep.js';

const WRITE = process.argv.includes('--write');
const DIACRITICS = /[čćšžđČĆŠŽĐ]/g;

/** How many diacritics a name carries — the signal that it survived intact. */
const diacriticCount = (name) => (name.match(DIACRITICS) || []).length;

/** Does the name look properly capitalized? "Đani" over "djani". */
const isCapitalized = (name) => /^[A-ZČĆŠŽĐ]/.test(name.trim());

/**
 * Pick the row to keep out of a group of duplicates.
 * Order: most diacritics, then proper capitalization, then most songs.
 */
function pickSurvivor(candidates) {
  return [...candidates].sort(
    (a, b) =>
      diacriticCount(b.name) - diacriticCount(a.name) ||
      Number(isCapitalized(b.name)) - Number(isCapitalized(a.name)) ||
      (b.songs || 0) - (a.songs || 0) ||
      String(a._id).localeCompare(String(b._id))
  )[0];
}

await connect();

const groups = await Artist.aggregate([
  { $group: { _id: '$searchName', n: { $sum: 1 }, ids: { $push: '$_id' } } },
  { $match: { n: { $gt: 1 } } }
]);

let merged = 0;
let songsMoved = 0;
let trashed = 0;
const samples = [];

for (const g of groups) {
  const rows = await Artist.find({ _id: { $in: g.ids } }).lean();
  for (const r of rows) r.songs = await Song.countDocuments({ artist: r._id, deletedAt: null });

  const keep = pickSurvivor(rows);
  const losers = rows.filter((r) => String(r._id) !== String(keep._id));
  if (!losers.length) continue;

  const songsToMove = losers.reduce((n, r) => n + r.songs, 0);
  merged++;
  songsMoved += songsToMove;
  trashed += losers.length;

  if (samples.length < 12) {
    samples.push(
      `${keep.name} (${keep.songs}) ← ` +
        losers.map((r) => `${r.name} (${r.songs})`).join(', ')
    );
  }

  if (!WRITE) continue;

  const ids = losers.map((r) => r._id);
  if (songsToMove) await Song.updateMany({ artist: { $in: ids } }, { $set: { artist: keep._id } });
  await Artist.updateMany({ _id: { $in: ids } }, { $set: { deletedAt: new Date() } });
}

console.log(`\n  duplicate groups: ${groups.length}`);
console.log(`  merged          : ${merged}`);
console.log(`  songs moved     : ${songsMoved}`);
console.log(`  artists trashed : ${trashed}\n`);
console.log('  === sample (kept ← deleted) ===');
for (const s of samples) console.log(`     ${s}`);

if (WRITE) {
  // song counters on the surviving rows are now stale
  for (const g of groups) {
    for (const id of g.ids) {
      const n = await Song.countDocuments({ artist: id, deletedAt: null });
      await Artist.updateOne({ _id: id }, { $set: { songCount: n } });
    }
  }
  console.log('\n  counters refreshed.');
} else {
  console.log('\n  (dry run — nothing was written; add --write)');
}

await mongoose.disconnect();
process.exit(0);
