/**
 * Takes songs off the public catalogue that cannot be shown at all.
 *
 *   node scripts/maintenance/skloni-nespremne.js          # prijedlog
 *   node scripts/maintenance/skloni-nespremne.js --write
 *
 * Two kinds qualify, and only these two:
 *
 *   prazna   — the importer left a title behind and no lyrics, so the page
 *              renders "{Tekst i akordi još nisu upisani.}" to a visitor
 *   siroce   — the artist row it points at does not exist, not even in the
 *              trash, so the song cannot be reached or attributed
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
const PRAZNA = /nisu upisani|nije ažuriran|nije azuriran/i;

await connect();

const zivi = new Set((await Artist.find().select('_id').lean()).map((a) => String(a._id)));

const kandidati = await Song.find({ deletedAt: null, status: 'published' })
  .select('title artist arrangements.content')
  .lean();

const prazne = [];
const sirocad = [];

for (const s of kandidati) {
  const sadrzaj = s.arrangements?.[0]?.content || '';
  if (!zivi.has(String(s.artist))) sirocad.push(s);
  else if (!sadrzaj.trim() || PRAZNA.test(sadrzaj)) prazne.push(s);
}

const svi = [...prazne, ...sirocad].map((s) => s._id);

console.log(`\n  objavljenih pjesama : ${kandidati.length}`);
console.log(`     prazne            : ${prazne.length}`);
console.log(`     bez izvođača      : ${sirocad.length}`);
console.log(`     ukupno za sklanjanje: ${svi.length}\n`);
for (const s of [...prazne.slice(0, 4), ...sirocad.slice(0, 4)]) {
  console.log(`     ${s.title.slice(0, 40)}`);
}

if (WRITE && svi.length) {
  const r = await Song.updateMany({ _id: { $in: svi } }, { $set: { status: 'draft' } });
  console.log(`\n  skinuto s objave: ${r.modifiedCount}`);
  console.log(`  objavljenih ostalo: ${await Song.countDocuments({ deletedAt: null, status: 'published' })}`);
} else if (!WRITE) {
  console.log('\n  (probni prolaz — ništa nije upisano; dodaj --write)');
}

await mongoose.disconnect();
process.exit(0);
