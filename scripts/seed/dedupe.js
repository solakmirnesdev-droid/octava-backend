/**
 * Removes songs that are the same song twice.
 *
 * A one-off repair for what the importers had already let in. The guard that
 * stops it happening again lives in rebuild.js and seed-from-titles.js, which
 * share the same fold — fixing the database without fixing the source means the
 * next import brings the duplicates straight back.
 */
import 'dotenv/config';
import { env } from '../../src/config/env.js';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import Rating from '../../src/models/Rating.js';
import Review from '../../src/models/Review.js';
import { foldTitle } from '../../src/utils/foldTitle.js';

/** The better spelling wins: more accents means somebody typed it properly. */
function score(title) {
  const accents = (title.match(/[čćžšđČĆŽŠĐ]/g) || []).length;
  const punctuation = (title.match(/[,?!.'’-]/g) || []).length;
  return accents * 10 + punctuation + title.length * 0.01;
}

await mongoose.connect(env.MONGODB_URI);

const songs = await Song.find({}, { title: 1, artist: 1 }).populate('artist', 'name');

const groups = new Map();
for (const s of songs) {
  const key = foldTitle(s.title);
  if (!key) continue;
  const id = `${s.artist?._id || 'nepoznat'}|${key}`;
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(s);
}

const dupes = [...groups.values()].filter((g) => g.length > 1);
let removed = 0;

for (const group of dupes) {
  group.sort((a, b) => score(b.title) - score(a.title));
  const keep = group[0];
  const drop = group.slice(1);

  console.log(`  ${(keep.artist?.name || '?').slice(0, 20).padEnd(21)}zadrzano ${JSON.stringify(keep.title)}`
    + `  obrisano ${drop.map((d) => JSON.stringify(d.title)).join(' ')}`);

  const ids = drop.map((d) => d._id);
  // Votes and reviews would otherwise point at a song that no longer exists.
  await Rating.deleteMany({ song: { $in: ids } });
  await Review.deleteMany({ song: { $in: ids } });
  await Song.deleteMany({ _id: { $in: ids } });
  removed += ids.length;
}

for (const a of await Artist.find()) {
  await Artist.updateOne({ _id: a._id }, { songCount: await Song.countDocuments({ artist: a._id }) });
}

console.log(`\n  grupa: ${dupes.length}   obrisano pjesama: ${removed}   ostalo: ${await Song.countDocuments()}`);
await mongoose.disconnect();
