/**
 * Seeds the browsing vocabulary.
 *
 *   node scripts/seedGenres.js
 *
 * Safe to re-run: existing rubrics are updated in place rather than duplicated,
 * and songCount is left alone so re-seeding never corrupts the counters.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Genre from '../src/models/Genre.js';

// `kind` groups these for display. A song is routinely both a region and a
// style, which is exactly why they live in one list instead of two trees.
const GENRES = [
  { name: 'Domaća',       kind: 'region', order: 10, description: 'Muzika sa prostora bivše Jugoslavije.' },
  { name: 'Ex-Yu',        kind: 'region', order: 20, description: 'Klasici jugoslovenske scene.' },
  { name: 'Strana',       kind: 'region', order: 30, description: 'Inostrani izvođači.' },

  { name: 'Narodna',      kind: 'style',  order: 10 },
  { name: 'Sevdalinka',   kind: 'style',  order: 20, description: 'Bosanska tradicionalna pjesma.' },
  { name: 'Starogradska', kind: 'style',  order: 30 },
  { name: 'Zabavna',      kind: 'style',  order: 40, description: 'Zabavna muzika, šlager.' },
  { name: 'Pop',          kind: 'style',  order: 50 },
  { name: 'Rock',         kind: 'style',  order: 60 },
  { name: 'Folk',         kind: 'style',  order: 70 },
  { name: 'Tamburaška',   kind: 'style',  order: 80 },
  { name: 'Duhovna',      kind: 'style',  order: 90 },
  { name: 'Dječija',      kind: 'style',  order: 100 },
  { name: 'Hip hop',      kind: 'style',  order: 110 }
];

try {
  await connectDB();

  let created = 0;
  let updated = 0;

  for (const entry of GENRES) {
    const existing = await Genre.findOne({ name: entry.name });

    if (existing) {
      existing.kind = entry.kind;
      existing.order = entry.order;
      if (entry.description) existing.description = entry.description;
      await existing.save();
      updated++;
    } else {
      await Genre.create(entry);
      created++;
    }
  }

  console.log('Genres created: ' + created + ', updated: ' + updated);

  const all = await Genre.find().sort({ kind: 1, order: 1 });
  for (const g of all) {
    console.log('  [' + g.kind.padEnd(6) + '] ' + g.name.padEnd(14) + '/zanr/' + g.slug);
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
