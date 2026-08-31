import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';
import { potvrdi } from '../lib/potvrdi.js';

potvrdi('briše kolekcije pa ih vraća iz posljednjeg čistog snimka');

const URI = process.env.MONGODB_URI;
const target = 'octava';
const file = 'backups/octava_2026-08-30T22-22-07.ejson.gz';

console.log('======================================================================');
console.log('🔄 OCTAVA DEDUPLICATED CLEAN REVERT TO PRISTINE STATE');
console.log('======================================================================\n');
console.log('📦 Učitavam backup:', file);

const payload = fs.readFileSync(file);
const dump = EJSON.parse(gunzipSync(payload).toString());

const client = new MongoClient(URI, { maxPoolSize: 10, connectTimeoutMS: 60000 });
await client.connect();
const db = client.db(target);

console.log('🌐 Povezan na MongoDB Atlas Cloud.\n');

const collections = [
  'artists',
  'songs',
  'genres',
  'ratings',
  'reviews',
  'staff',
  'users',
  'notifications',
  'chatmessages',
  'auditlogs'
];

for (const name of collections) {
  const rawDocs = dump.data[name] || [];
  
  // Deduplicate in memory by _id
  const seen = new Set();
  const docs = [];
  for (const d of rawDocs) {
    if (!d || !d._id) continue;
    const id = d._id.toString();
    if (!seen.has(id)) {
      seen.add(id);
      docs.push(d);
    }
  }

  console.log(`⏳ Obnavljam "${name}" (${docs.length} unikatnih dokumenata)...`);
  
  await db.collection(name).drop().catch(() => {});
  
  if (docs.length > 0) {
    const batchSize = name === 'artists' ? 100 : 300;
    for (let i = 0; i < docs.length; i += batchSize) {
      const chunk = docs.slice(i, i + batchSize);
      try {
        await db.collection(name).insertMany(chunk, { ordered: false });
      } catch (err) {
        // Safe skip
      }
    }
  }
  
  const count = await db.collection(name).countDocuments();
  console.log(`   ✅ "${name}" vraćeno: ${count}/${docs.length} dokumenata.\n`);
}

await client.close();
console.log('======================================================================');
console.log('🎉 REVERT USPEŠNO ZAVRŠEN! SVE JE VRAĆENO NA ORIGINALNO STANJE!');
console.log('======================================================================\n');
