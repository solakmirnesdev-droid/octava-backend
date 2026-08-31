/**
 * Fills searchLyrics on every song, so the text index has words to hold.
 *
 *   node scripts/maintenance/backfill-search-lyrics.js
 *
 * AI-NOTE: needed once, after the field was added. New and edited songs get it
 * from the pre-validate hook; the catalogue that already existed does not, and
 * an empty field means the song is unfindable by its own words.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';

await mongoose.connect(process.env.MONGODB_URI);

const clean = (song) => (song.arrangements || [])
  .filter((a) => !a.deletedAt)
  .map((a) => a.content || '')
  .join('\n')
  .replace(/\[[^\]]*\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 20000);

const started = Date.now();
let seen = 0;
let written = 0;

// Streamed rather than loaded: sixteen thousand chord sheets do not belong in
// memory at once.
const cursor = Song.find().select('arrangements searchLyrics').lean().cursor();

let batch = [];
for await (const song of cursor) {
  seen += 1;
  const next = clean(song);
  if (next !== (song.searchLyrics || '')) {
    batch.push({ updateOne: { filter: { _id: song._id }, update: { $set: { searchLyrics: next } } } });
    written += 1;
  }
  if (batch.length >= 500) { await Song.bulkWrite(batch, { ordered: false }); batch = []; }
}
if (batch.length) await Song.bulkWrite(batch, { ordered: false });

console.log(`  pregledano ${seen}, upisano ${written}, za ${((Date.now() - started) / 1000).toFixed(1)}s`);
await mongoose.disconnect();
