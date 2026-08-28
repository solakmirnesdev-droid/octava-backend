/**
 * Loads the public-domain catalogue.
 *
 * Idempotent by slug: running it twice updates rather than duplicates, so it
 * can be re-run after the texts are corrected.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import Artist from '../../src/models/Artist.js';
import Genre from '../../src/models/Genre.js';
import Staff from '../../src/models/Staff.js';
import { slugify } from '../../src/utils/slug.js';
import { TRADITIONAL } from './traditional.js';

await mongoose.connect(process.env.MONGODB_URI);

// Attributed to a real account so the audit trail is not empty.
const editor = await Staff.findOne({ role: 'superadmin' }) || await Staff.findOne();
if (!editor) {
  console.error('  Nema nijednog naloga osoblja — pjesme moraju imati autora unosa.');
  process.exit(1);
}

let created = 0;
let updated = 0;

for (const entry of TRADITIONAL) {
  const artist = await Artist.findOrCreateByName(entry.artist);
  const genres = await Genre.find({ slug: { $in: entry.genres } }).select('_id');
  const slug = slugify(entry.title);

  const arrangement = {
    label: 'Osnovna verzija',
    content: entry.content,
    originalKey: entry.originalKey,
    capo: entry.capo,
    difficulty: entry.difficulty,
    isPrimary: true
  };

  const existing = await Song.findOne({ slug });
  if (existing) {
    existing.arrangements = [{ ...arrangement, _id: existing.arrangements[0]?._id }];
    existing.genres = genres.map((g) => g._id);
    existing.tags = entry.needsReview ? ['javno-vlasnistvo', 'treba-provjeru'] : ['javno-vlasnistvo'];
    existing.status = 'published';
    existing.updatedBy = editor._id;
    await existing.save();
    updated++;
    continue;
  }

  await Song.create({
    title: entry.title,
    artist: artist._id,
    genres: genres.map((g) => g._id),
    // Greppable: these are the songs that can be published without asking.
    tags: entry.needsReview ? ['javno-vlasnistvo', 'treba-provjeru'] : ['javno-vlasnistvo'],
    status: 'published',
    createdBy: editor._id,
    updatedBy: editor._id,
    arrangements: [arrangement]
  });
  created++;
}

// Counts are denormalised, so recompute rather than guess at deltas.
for (const a of await Artist.find()) {
  await Artist.updateOne({ _id: a._id }, { songCount: await Song.countDocuments({ artist: a._id }) });
}
for (const g of await Genre.find()) {
  await Genre.updateOne({ _id: g._id }, { songCount: await Song.countDocuments({ genres: g._id }) });
}

console.log(`  novih: ${created}  azuriranih: ${updated}`);
await mongoose.disconnect();
