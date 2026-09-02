/**
 * Takes songs off the public catalogue that cannot be shown at all.
 *
 *   node scripts/maintenance/unpublish-incomplete.js          # proposal
 *   node scripts/maintenance/unpublish-incomplete.js --write
 *
 * Two kinds qualify, and only these two:
 *
 *   empty    — the importer left a title behind and no lyrics, so the page
 *              renders "{Tekst i akordi još nisu upisani.}" to a visitor
 *   orphan   — the artist row it points at does not exist, not even in the
 *              trash, so the song cannot be reached or attributed
 *
 * AI-NOTE: EMPTY_MARKER matches the Bosnian placeholder text stored in song
 * content. It is data, not prose — leave the pattern alone.
 *
 * AI-DECISION: status goes to 'draft'; nothing is deleted and nothing is
 * trashed. These songs are wanted — they are simply not finished, and a draft
 * is exactly that. The catalogue count drops from 14,389 to what is really
 * readable, and the songs stay in the dashboard queue for filling in. See
 * KATALOG.md §7.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import { connect } from '../lib/sweep.js';

const WRITE = process.argv.includes('--write');
const EMPTY_MARKER = /nisu upisani|nije ažuriran|nije azuriran/i;

await connect();

const liveArtistIds = new Set((await Artist.find().select('_id').lean()).map((a) => String(a._id)));

const candidates = await Song.find({ deletedAt: null, status: 'published' })
  .select('title artist arrangements.content')
  .lean();

const empty = [];
const orphans = [];

for (const s of candidates) {
  const content = s.arrangements?.[0]?.content || '';
  if (!liveArtistIds.has(String(s.artist))) orphans.push(s);
  else if (!content.trim() || EMPTY_MARKER.test(content)) empty.push(s);
}

const all = [...empty, ...orphans].map((s) => s._id);

console.log(`\n  published songs     : ${candidates.length}`);
console.log(`     empty             : ${empty.length}`);
console.log(`     without an artist : ${orphans.length}`);
console.log(`     total to unpublish: ${all.length}\n`);
for (const s of [...empty.slice(0, 4), ...orphans.slice(0, 4)]) {
  console.log(`     ${s.title.slice(0, 40)}`);
}

if (WRITE && all.length) {
  const r = await Song.updateMany({ _id: { $in: all } }, { $set: { status: 'draft' } });
  console.log(`\n  unpublished: ${r.modifiedCount}`);
  console.log(`  still published: ${await Song.countDocuments({ deletedAt: null, status: 'published' })}`);
} else if (!WRITE) {
  console.log('\n  (dry run — nothing was written; add --write)');
}

await mongoose.disconnect();
process.exit(0);
