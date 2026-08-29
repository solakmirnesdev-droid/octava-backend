/**
 * Narrows the catalogue to the four countries the songbook is for.
 *
 *   node scripts/seed/restrict-to-region.js          # dry run
 *   node scripts/seed/restrict-to-region.js --write  # actually removes
 *
 * Everything here is a SOFT delete. Songs and artists land in the dashboard's
 * Trash and come back from there, which is the only reason this is safe to run
 * on a catalogue somebody has been building for weeks.
 *
 * AI-TRAP: the obvious rule — "remove every artist whose country is not one of
 * ours" — destroys the heart of the catalogue. Six artists carry `YU` because
 * they predate the split, and Bijelo Dugme, Idoli and Boa are exactly the
 * repertoire this songbook exists for. Fourteen more carry no country at all,
 * among them `Tradicionalna` and Aleksa Šantić, who hold all 22 public-domain
 * songs — the only entries in the whole catalogue with real words in them.
 * Neither group is foreign. They are missing metadata, and the fix for missing
 * metadata is to fill it in. Both are listed and skipped, never removed.
 *
 * Order matters: songs first, then the artist. artistAdminController refuses to
 * delete an artist who still has songs, on the grounds that it would orphan
 * them, and a script has no business being cleverer than the API about that.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Genre from '../../src/models/Genre.js';
import Staff from '../../src/models/Staff.js';
import AuditLog from '../../src/models/AuditLog.js';

/** Bosnia and Herzegovina, Croatia, Montenegro, Serbia. */
const KEEP = ['BA', 'HR', 'ME', 'RS'];

/** Kept whatever their country says: the split postdates them. */
const KEEP_LEGACY = ['YU'];

/** Removed by name rather than by country — the right country, the wrong genre. */
const REMOVE_BY_NAME = ['Buba Corelli'];

const WRITE = process.argv.includes('--write');

await mongoose.connect(process.env.MONGODB_URI);

const staff = await Staff.findOne({ role: 'superadmin' }) || await Staff.findOne();
if (!staff) {
  console.error('  Nema naloga osoblja — brisanje mora imati potpis.');
  process.exit(1);
}

const living = await Artist.find({ deletedAt: null }).select('name country songCount').lean();

const doomed = living.filter((a) =>
  REMOVE_BY_NAME.includes(a.name)
  || (a.country && !KEEP.includes(a.country) && !KEEP_LEGACY.includes(a.country))
);

const unknown = living.filter((a) => !a.country && !REMOVE_BY_NAME.includes(a.name));
const legacy = living.filter((a) => KEEP_LEGACY.includes(a.country));

console.log(`\n  UKLANJA SE (${doomed.length} izvodjaca)`);
let songTotal = 0;
for (const a of doomed.sort((x, y) => (x.country || '').localeCompare(y.country || ''))) {
  const n = await Song.countDocuments({ artist: a._id });
  songTotal += n;
  console.log(`    [${a.country || '--'}] ${a.name} — ${n} pjesama`);
}

console.log(`\n  OSTAJE, iako nije u BA/HR/ME/RS (${legacy.length}) — stariji od raspada`);
console.log('    ' + legacy.map((a) => a.name).join(', '));

console.log(`\n  OSTAJE, nema drzavu u bazi (${unknown.length}) — treba dopuniti, ne obrisati`);
console.log('    ' + unknown.map((a) => a.name).join(', '));

console.log(`\n  ukupno pjesama za uklanjanje: ${songTotal}`);

if (!WRITE) {
  console.log('\n  (probni prolaz — nista nije obrisano; dodaj --write)\n');
  await mongoose.disconnect();
  process.exit(0);
}

let songs = 0;
for (const a of doomed) {
  const res = await Song.updateMany(
    { artist: a._id },
    { deletedAt: new Date(), deletedBy: staff._id }
  );
  songs += res.modifiedCount;

  await Artist.updateOne(
    { _id: a._id },
    { deletedAt: new Date(), deletedBy: staff._id, songCount: 0 }
  );

  await AuditLog.record({
    action: 'delete',
    entity: 'artist',
    entityId: a._id,
    entityLabel: a.name,
    meta: { reason: 'van regije', country: a.country || null, songs: res.modifiedCount }
  });
}

// Rubric counters are denormalised and now overstate what is visible.
for (const g of await Genre.find()) {
  await Genre.updateOne({ _id: g._id }, { songCount: await Song.countDocuments({ genres: g._id }) });
}

console.log(`\n  obrisano: ${doomed.length} izvodjaca, ${songs} pjesama (mekano — vracaju se iz Trash-a)\n`);
await mongoose.disconnect();
