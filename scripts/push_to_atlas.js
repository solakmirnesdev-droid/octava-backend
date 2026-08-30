/**
 * Direct Migration Script: Local MongoDB -> MongoDB Atlas
 * 
 * Usage:
 *   node scripts/push_to_atlas.js "mongodb+srv://user:pass@cluster.mongodb.net/octava?retryWrites=true&w=majority"
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const LOCAL_URI = process.env.MONGODB_URI;
const ATLAS_URI = process.argv[2] || process.env.ATLAS_URI;

if (!ATLAS_URI) {
  console.error('❌ Greška: Niste proslijedili Atlas Connection URI.');
  console.error('Primjer upotrebe:');
  console.error('  node scripts/push_to_atlas.js "mongodb+srv://<username>:<password>@<cluster>.mongodb.net/octava?retryWrites=true&w=majority"');
  process.exit(1);
}

async function migrateToAtlas() {
  console.log('======================================================================');
  console.log('🚀 [AtlasMigration] Pokrećem prebacivanje lokalne baze na MongoDB Atlas');
  console.log('======================================================================\n');

  const localClient = new MongoClient(LOCAL_URI);
  const atlasClient = new MongoClient(ATLAS_URI);

  try {
    console.log('1. Povezujem se na lokalni MongoDB...');
    await localClient.connect();
    const localDb = localClient.db('octava');
    console.log('  ✓ Lokalni MongoDB povezan.');

    console.log('\n2. Povezujem se na MongoDB Atlas...');
    await atlasClient.connect();
    
    // Extract target db name from Atlas URI or default to 'octava'
    const atlasDbName = new URL(ATLAS_URI.replace('mongodb+srv://', 'http://')).pathname.slice(1) || 'octava';
    const atlasDb = atlasClient.db(atlasDbName);
    console.log(`  ✓ MongoDB Atlas povezan na bazu "${atlasDbName}".`);

    const collections = await localDb.listCollections().toArray();
    console.log(`\n3. Prebacujem ${collections.length} kolekcija na Atlas...`);

    let totalMigrated = 0;

    for (const { name } of collections) {
      if (name.startsWith('system.')) continue;

      const count = await localDb.collection(name).countDocuments({});
      if (count === 0) {
        console.log(`  - ${name.padEnd(16)}: 0 dokumenata (preskačem)`);
        continue;
      }

      console.log(`  -> Prebacujem "${name}" (${count} dokumenata)...`);
      const targetCol = atlasDb.collection(name);
      
      // Clear target collection first to prevent duplicates
      await targetCol.deleteMany({});

      // Migrate in batches of 500 for maximum network speed and stability
      const cursor = localDb.collection(name).find({});
      let batch = [];
      let migratedInCol = 0;

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        batch.push(doc);

        if (batch.length >= 500) {
          await targetCol.insertMany(batch);
          migratedInCol += batch.length;
          process.stdout.write(`     Napredak: ${migratedInCol}/${count}...\r`);
          batch = [];
        }
      }

      if (batch.length > 0) {
        await targetCol.insertMany(batch);
        migratedInCol += batch.length;
      }

      // Recreate indexes
      const indexes = await localDb.collection(name).indexes();
      for (const idx of indexes) {
        if (idx.name === '_id_') continue;
        try {
          const { key, name: idxName, unique, sparse } = idx;
          const options = { name: idxName };
          if (unique) options.unique = true;
          if (sparse) options.sparse = true;
          await targetCol.createIndex(key, options);
        } catch (e) {
          // Ignore index warning
        }
      }

      console.log(`  ✓ "${name.padEnd(16)}": ${migratedInCol}/${count} dokumenata prebačeno sa indeksima.`);
      totalMigrated += migratedInCol;
    }

    console.log('\n======================================================================');
    console.log(`🎉 [MIGRACIJA USPJEŠNA] Ukupno prebačeno ${totalMigrated} dokumenata na Atlas!`);
    console.log('======================================================================');
    console.log('\nMožeš postaviti ovaj Atlas URI u .env fajl na obje mašine:');
    console.log(`MONGODB_URI=${ATLAS_URI}\n`);

  } catch (err) {
    console.error('\n❌ Greška tokom migracije:', err.message);
    process.exitCode = 1;
  } finally {
    await localClient.close();
    await atlasClient.close();
  }
}

migrateToAtlas();
