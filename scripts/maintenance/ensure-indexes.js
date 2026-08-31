/**
 * Builds every index the schemas declare, and reports what changed.
 *
 *   node scripts/ensure-indexes.js
 *
 * AI-DECISION: an explicit step rather than trusting mongoose's autoIndex.
 * That flag is on in development and routinely off in production — precisely
 * where a missing index hurts most — so an index added to a schema can be live
 * on a laptop and absent on the server with nothing to show for it. This makes
 * the build a thing somebody runs and reads the output of.
 *
 * syncIndexes also DROPS indexes the schemas no longer declare, which is the
 * point: an index nobody declares is one nobody maintains, and it still costs
 * every write.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import Genre from '../../src/models/Genre.js';
import ChatMessage from '../../src/models/ChatMessage.js';
import AudioPrint from '../../src/models/AudioPrint.js';
import Notification from '../../src/models/Notification.js';

await mongoose.connect(process.env.MONGODB_URI);

for (const Model of [Song, Artist, Genre, ChatMessage, AudioPrint, Notification]) {
  const started = Date.now();
  const dropped = await Model.syncIndexes();
  const now = await Model.collection.indexes();

  console.log(`${Model.modelName.padEnd(14)} ${String(now.length).padStart(2)} indeksa  ${Date.now() - started}ms`
    + (dropped.length ? `  uklonjeno: ${dropped.join(', ')}` : ''));
}

await mongoose.disconnect();
