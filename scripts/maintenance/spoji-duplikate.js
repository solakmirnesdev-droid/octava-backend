/**
 * Sends duplicate songs to the trash, keeping the best copy of each.
 *
 *   node scripts/maintenance/spoji-duplikate.js            # prijedlog
 *   node scripts/maintenance/spoji-duplikate.js --write
 *   node scripts/maintenance/spoji-duplikate.js --write --atlas
 *
 * A duplicate group is one searchTitle under one artist appearing more than
 * once among the living rows.
 *
 * AI-DECISION: the survivor is chosen in this order, and the order matters
 * more than it looks:
 *
 *   1. A row with no importer tag wins over a scraped one. That row is
 *      Mirnes's own work; the scraped copy is the one that can be refetched.
 *   2. Higher quality.score — the measured distance from the house pattern.
 *   3. Longer content. Between two copies scoring the same, the longer one is
 *      usually the one with the last verse still attached.
 *   4. Older _id. Keeping the original preserves whatever already points at it.
 *
 * AI-NOTE: losers are SOFT-deleted — they land in the same trash as everything
 * else and the dashboard can restore them. Nothing here removes a row. That is
 * deliberate: this rule is a good default, not an oracle, and 57 groups is
 * small enough that a person may want to revisit one.
 */
import mongoose from 'mongoose';
import Song from '../../src/models/Song.js';
import '../../src/models/Artist.js';
import { connect } from '../lib/sweep.js';

const WRITE = process.argv.includes('--write');
const IZVORI = ['pesmarica.rs', '2akordi.net', 'tacnaharmonija.rs', 'uvoz'];

const skrejpovana = (s) => (s.tags || []).some((t) => IZVORI.includes(t));
const duzina = (s) => (s.arrangements?.[0]?.content || '').length;

/** The copy to keep. Everything else in the group goes to the trash. */
function izaberi(grupa) {
  return [...grupa].sort(
    (a, b) =>
      Number(skrejpovana(a)) - Number(skrejpovana(b)) ||
      (b.quality?.score ?? 0) - (a.quality?.score ?? 0) ||
      duzina(b) - duzina(a) ||
      String(a._id).localeCompare(String(b._id))
  )[0];
}

await connect();

const grupe = await Song.aggregate([
  { $match: { deletedAt: null } },
  { $group: { _id: { t: '$searchTitle', a: '$artist' }, n: { $sum: 1 }, ids: { $push: '$_id' } } },
  { $match: { n: { $gt: 1 } } }
]);

let uKantu = 0;
let saPregledima = 0;
const uzorci = [];

for (const g of grupe) {
  const redovi = await Song.find({ _id: { $in: g.ids } })
    .select('title tags quality views favoriteCount arrangements.content')
    .lean();

  const cuvamo = izaberi(redovi);
  const gubitnici = redovi.filter((r) => String(r._id) !== String(cuvamo._id));
  if (!gubitnici.length) continue;

  uKantu += gubitnici.length;
  saPregledima += gubitnici.filter((r) => (r.views || 0) > 0 || (r.favoriteCount || 0) > 0).length;

  if (uzorci.length < 10) {
    const opis = (s) =>
      `${((s.tags || []).filter((t) => IZVORI.includes(t))[0] || 'ručno').padEnd(16)} ` +
      `ocjena ${String(s.quality?.score ?? '-').padStart(3)}  ${String(duzina(s)).padStart(5)} zn.`;
    uzorci.push(
      `${cuvamo.title.slice(0, 30)}\n        ČUVAMO  ${opis(cuvamo)}\n` +
        gubitnici.map((r) => `        kanta   ${opis(r)}`).join('\n')
    );
  }

  if (WRITE) {
    await Song.updateMany(
      { _id: { $in: gubitnici.map((r) => r._id) } },
      { $set: { deletedAt: new Date() } }
    );
  }
}

console.log(`\n  grupa duplikata : ${grupe.length}`);
console.log(`  u kantu         : ${uKantu}`);
console.log(`  od toga s pregledima ili favoritima: ${saPregledima}`);
console.log(`\n  === uzorak (${uzorci.length}) ===`);
for (const u of uzorci) console.log(`     ${u}`);

if (!WRITE) console.log('\n  (probni prolaz — ništa nije upisano; dodaj --write)\n');
else console.log(`\n  gotovo. Živih pjesama: ${await Song.countDocuments({ deletedAt: null })}\n`);

await mongoose.disconnect();
process.exit(0);
