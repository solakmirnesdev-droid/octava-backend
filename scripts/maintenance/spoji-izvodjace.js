/**
 * Merges artists that are the same person stored twice.
 *
 *   node scripts/maintenance/spoji-izvodjace.js            # prijedlog, ništa se ne piše
 *   node scripts/maintenance/spoji-izvodjace.js --write
 *
 * The catalogue holds 228 groups where two or more Artist rows share one
 * searchName — the very field the app compares names by, so it already cannot
 * tell them apart: Đani / Djani, Nataša Bekvalac / Natasa Bekvalac,
 * Željko Šasić / Željko Šašić.
 *
 * AI-DECISION: the survivor is the one spelled correctly, NOT the one holding
 * the songs. In this catalogue the songs frequently sit on the misspelled row —
 * Željko Šasić has eight and Željko Šašić has none — and Mirnes asked for
 * names without spelling errors. Picking by song count would have preserved
 * the typo and thrown away the correct name. Diacritics decide it: stripping
 * č, ć, š, ž, đ is how these duplicates are born, so the richer spelling is the
 * original. See KATALOG.md §7.
 *
 * AI-NOTE: losers are soft-deleted, never removed. They land in the same trash
 * as everything else and can be restored from the dashboard.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import { connect } from '../lib/sweep.js';

const WRITE = process.argv.includes('--write');
const DIJAKRITICI = /[čćšžđČĆŠŽĐ]/g;

/** How many diacritics a name carries — the signal that it survived intact. */
const bogatstvo = (ime) => (ime.match(DIJAKRITICI) || []).length;

/** Does the name look properly capitalised? "Đani" over "djani". */
const uredno = (ime) => /^[A-ZČĆŠŽĐ]/.test(ime.trim());

/**
 * Pick the row to keep out of a group of duplicates.
 * Order: most diacritics, then proper capitalisation, then most songs.
 */
function izaberi(kandidati) {
  return [...kandidati].sort(
    (a, b) =>
      bogatstvo(b.name) - bogatstvo(a.name) ||
      Number(uredno(b.name)) - Number(uredno(a.name)) ||
      (b.pjesama || 0) - (a.pjesama || 0) ||
      String(a._id).localeCompare(String(b._id))
  )[0];
}

await connect();

const grupe = await Artist.aggregate([
  { $group: { _id: '$searchName', n: { $sum: 1 }, ids: { $push: '$_id' } } },
  { $match: { n: { $gt: 1 } } }
]);

let spojeno = 0;
let premjesteno = 0;
let uKantu = 0;
const uzorci = [];

for (const g of grupe) {
  const redovi = await Artist.find({ _id: { $in: g.ids } }).lean();
  for (const r of redovi) r.pjesama = await Song.countDocuments({ artist: r._id, deletedAt: null });

  const cuvamo = izaberi(redovi);
  const gubitnici = redovi.filter((r) => String(r._id) !== String(cuvamo._id));
  if (!gubitnici.length) continue;

  const pjesamaZaSeobu = gubitnici.reduce((n, r) => n + r.pjesama, 0);
  spojeno++;
  premjesteno += pjesamaZaSeobu;
  uKantu += gubitnici.length;

  if (uzorci.length < 12) {
    uzorci.push(
      `${cuvamo.name} (${cuvamo.pjesama}) ← ` +
        gubitnici.map((r) => `${r.name} (${r.pjesama})`).join(', ')
    );
  }

  if (!WRITE) continue;

  const ids = gubitnici.map((r) => r._id);
  if (pjesamaZaSeobu) await Song.updateMany({ artist: { $in: ids } }, { $set: { artist: cuvamo._id } });
  await Artist.updateMany({ _id: { $in: ids } }, { $set: { deletedAt: new Date() } });
}

console.log(`\n  grupa duplikata: ${grupe.length}`);
console.log(`  spojeno         : ${spojeno}`);
console.log(`  pjesama premješteno: ${premjesteno}`);
console.log(`  izvođača u kantu: ${uKantu}\n`);
console.log('  === uzorak (čuvamo ← briše se) ===');
for (const u of uzorci) console.log(`     ${u}`);

if (WRITE) {
  // song counters on the surviving rows are now stale
  for (const g of grupe) {
    for (const id of g.ids) {
      const n = await Song.countDocuments({ artist: id, deletedAt: null });
      await Artist.updateOne({ _id: id }, { $set: { songCount: n } });
    }
  }
  console.log('\n  brojači osvježeni.');
} else {
  console.log('\n  (probni prolaz — ništa nije upisano; dodaj --write)');
}

await mongoose.disconnect();
process.exit(0);
