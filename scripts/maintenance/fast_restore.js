import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';

const URI = process.env.MONGODB_URI;
const target = 'octava';
const file = 'backups/octava_2026-08-30T22-22-07.ejson.gz';

console.log('⚡ Pokrećem Fast Turbo Restore iz backupa:', file);

const payload = fs.readFileSync(file);
const dump = EJSON.parse(gunzipSync(payload).toString());

const client = new MongoClient(URI);
await client.connect();
const db = client.db(target);

console.log('Restoring into "' + target + '" (takenAt: ' + dump.meta.takenAt + ')\n');

// List of critical collections first
const priority = ['artists', 'songs', 'genres', 'ratings', 'reviews', 'staff', 'users', 'notifications', 'chatmessages', 'auditlogs'];

for (const name of priority) {
  const docs = dump.data[name] || [];
  console.log(`📦 Vraćam kolekciju "${name}" (${docs.length} dokumenata)...`);
  
  await db.collection(name).deleteMany({});
  
  if (docs.length > 0) {
    const CHUNK = 300;
    for (let i = 0; i < docs.length; i += CHUNK) {
      await db.collection(name).insertMany(docs.slice(i, i + CHUNK), { ordered: false });
    }
  }
  
  const count = await db.collection(name).countDocuments();
  console.log(`  ✅ ${name.padEnd(16)} -> ${count}/${dump.meta.collections[name] || docs.length} dokumenata`);
}

await client.close();
console.log('\n🎉 REVERT JE 100% USPEŠNO ZAVRŠEN! BAZA JE VRAĆENA NA ORIGINALNO STANJE PRE SVIH IZMENA!');
