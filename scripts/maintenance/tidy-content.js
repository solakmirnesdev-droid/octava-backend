/**
 * Cleans the whitespace an import left in songs already stored.
 *
 *   node scripts/maintenance/tidy-content.js          # counts only
 *   node scripts/maintenance/tidy-content.js --write  # saves
 *
 * New and edited songs are tidied by the hook in Song.js. The catalogue that
 * arrived before it does not pass through that hook, and 46% of it carries
 * doubled spaces inside lyric lines.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import { tidyContent } from '../../src/utils/tidyContent.js';

const WRITE = process.argv.includes('--write');
await mongoose.connect(process.env.MONGODB_URI);

let seen = 0;
let dirty = 0;
let batch = [];
const started = Date.now();

const cursor = Song.find().select('arrangements').lean().cursor();

for await (const song of cursor) {
  seen += 1;

  const arrangements = (song.arrangements || []).map((a) => ({ ...a, content: tidyContent(a.content) }));
  const changed = arrangements.some((a, i) => a.content !== song.arrangements[i].content);
  if (!changed) continue;

  dirty += 1;
  if (WRITE) {
    // Written field by field rather than through save(), so a document that
    // fails some unrelated validation cannot block the cleanup of the rest.
    batch.push({ updateOne: { filter: { _id: song._id }, update: { $set: { arrangements } } } });
    if (batch.length >= 500) { await Song.bulkWrite(batch, { ordered: false }); batch = []; }
  }
}
if (batch.length) await Song.bulkWrite(batch, { ordered: false });

console.log(`  pregledano ${seen}, za čišćenje ${dirty}, ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (!WRITE) console.log('  (probni prolaz — ništa nije upisano; dodaj --write)');

await mongoose.disconnect();
