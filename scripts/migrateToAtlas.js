/**
 * Copies the local database to a remote one.
 *
 *   node scripts/migrateToAtlas.js "mongodb+srv://user:pass@cluster/octava"
 *   node scripts/migrateToAtlas.js --verify "mongodb+srv://…"
 *
 * Reads through the driver rather than a dump file, so nothing sensitive is
 * written to disk on the way across. The source is left untouched: this copies,
 * it never moves, so a failed run costs nothing but time.
 *
 * Indexes are rebuilt from the Mongoose schemas rather than copied, because the
 * unique constraints — one vote per reader, one account per email — are what
 * keep the data honest and must exist before the first write.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');
const force = args.includes('--force');
const target = args.find((a) => a.startsWith('mongodb'));

if (!target) {
  console.error('Usage: node scripts/migrateToAtlas.js [--verify] [--force] "<connection string>"');
  process.exit(1);
}

const source = process.env.MONGODB_URI;
const dbName = new URL(source.replace('mongodb://', 'http://')).pathname.slice(1) || 'octava';

/** Never print the password back out. */
const redact = (uri) => uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:••••@');

const from = new MongoClient(source);
const to = new MongoClient(target);

try {
  await from.connect();
  await to.connect();

  const sourceDb = from.db(dbName);
  const targetDb = to.db(new URL(target.replace(/^mongodb(\+srv)?:\/\//, 'http://')).pathname.slice(1) || dbName);

  console.log('  izvor:   ' + redact(source));
  console.log('  odrediste: ' + redact(target));
  console.log('');

  const collections = await sourceDb.listCollections().toArray();

  if (verifyOnly) {
    console.log('  kolekcija        ovdje   tamo');
    let mismatch = 0;
    for (const { name } of collections) {
      const here = await sourceDb.collection(name).countDocuments();
      const there = await targetDb.collection(name).countDocuments();
      const ok = here === there;
      if (!ok) mismatch++;
      console.log(`  ${ok ? ' ' : '!'} ${name.padEnd(14)} ${String(here).padStart(6)} ${String(there).padStart(6)}`);
    }
    console.log('');
    console.log(mismatch ? `  ${mismatch} kolekcija se ne poklapa` : '  sve se poklapa');
    process.exitCode = mismatch ? 1 : 0;
  } else {
    // Refuse to write over an existing database unless told to; a second run
    // against a live cluster would otherwise silently duplicate everything.
    let existing = 0;
    for (const { name } of collections) {
      existing += await targetDb.collection(name).countDocuments();
    }
    if (existing && !force) {
      console.error(`  Odrediste vec sadrzi ${existing} dokumenata. Dodaj --force da ih prepises.`);
      process.exit(1);
    }

    for (const { name } of collections) {
      const docs = await sourceDb.collection(name).find({}).toArray();
      await targetDb.collection(name).deleteMany({});
      if (docs.length) await targetDb.collection(name).insertMany(docs);

      const copied = await targetDb.collection(name).countDocuments();
      const ok = copied === docs.length;
      console.log(`  ${ok ? 'ok  ' : 'GRESKA'} ${name.padEnd(14)} ${copied}/${docs.length}`);
      if (!ok) process.exitCode = 1;
    }

    console.log('');
    console.log('  Gradim indekse iz shema…');
    await mongoose.connect(target);
    await Promise.all([
      import('../src/models/User.js'),
      import('../src/models/Staff.js'),
      import('../src/models/Song.js'),
      import('../src/models/Artist.js'),
      import('../src/models/Genre.js'),
      import('../src/models/Rating.js'),
      import('../src/models/SongRequest.js')
    ]);
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    console.log('  indeksi spremni');
    await mongoose.disconnect();
  }
} catch (err) {
  console.error('Seoba nije uspjela:', err.message);
  process.exitCode = 1;
} finally {
  await from.close();
  await to.close();
}
