/**
 * Recomputes favoriteCount on every song from the authoritative source.
 *
 *   node scripts/backfillFavoriteCounts.js [--demo]
 *
 * The counter is maintained incrementally in normal operation, so this exists
 * for two reasons: filling it in for songs that predate the field, and
 * repairing drift if an update is ever lost.
 *
 * --demo additionally gives the generated test catalogue plausible counts, so
 * the dashboard charts have something to show. It never touches real songs.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Song from '../src/models/Song.js';
import User from '../src/models/User.js';

const demo = process.argv.includes('--demo');

try {
  await connectDB();

  // One pass over users, then one write per song that needs changing.
  const users = await User.find().select('favorites');
  const tally = new Map();

  for (const user of users) {
    for (const songId of user.favorites || []) {
      const key = songId.toString();
      tally.set(key, (tally.get(key) || 0) + 1);
    }
  }

  let corrected = 0;
  const songs = await Song.find().select('favoriteCount tags');

  for (const song of songs) {
    const actual = tally.get(song._id.toString()) || 0;
    if (song.favoriteCount !== actual) {
      await Song.updateOne({ _id: song._id }, { favoriteCount: actual });
      corrected++;
    }
  }

  console.log('Real favourites counted: ' + [...tally.values()].reduce((a, b) => a + b, 0));
  console.log('Songs corrected:         ' + corrected);

  if (demo) {
    // Roughly a tenth of views convert, which is the shape real numbers take.
    const generated = await Song.find({ tags: 'dummy' }).select('views');
    let seeded = 0;

    for (const song of generated) {
      const count = Math.floor((song.views / 10) * (0.4 + Math.random() * 1.2));
      await Song.updateOne({ _id: song._id }, { favoriteCount: count });
      seeded++;
    }
    console.log('Demo counts written on:  ' + seeded + ' generated songs');
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
