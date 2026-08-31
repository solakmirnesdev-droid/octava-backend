/**
 * Backfills the de-accented search copies on existing documents.
 *
 *   node scripts/backfillSearchFields.js
 *
 * New records get these from a pre-validate hook, but insertMany and any
 * document written before the field existed bypass it.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../../src/config/db.js';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import { slugify } from '../../src/utils/slug.js';

const fold = (value) => slugify(value).replace(/-/g, ' ');

try {
  await connectDB();

  const songs = await Song.find().select('title searchTitle');
  let songsUpdated = 0;
  for (const song of songs) {
    const next = fold(song.title);
    if (song.searchTitle !== next) {
      await Song.updateOne({ _id: song._id }, { searchTitle: next });
      songsUpdated++;
    }
  }

  const artists = await Artist.find().select('name searchName');
  let artistsUpdated = 0;
  for (const artist of artists) {
    const next = fold(artist.name);
    if (artist.searchName !== next) {
      await Artist.updateOne({ _id: artist._id }, { searchName: next });
      artistsUpdated++;
    }
  }

  console.log('Songs backfilled:   ' + songsUpdated + ' / ' + songs.length);
  console.log('Artists backfilled: ' + artistsUpdated + ' / ' + artists.length);
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
