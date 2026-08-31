import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import { gzipSync } from 'node:zlib';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const URI = process.env.MONGODB_URI;
const DB_NAME = new URL(URI.replace('mongodb://', 'http://')).pathname.slice(1) || 'octava';

const DRIVE = path.join(
  os.homedir(),
  'Library/CloudStorage/GoogleDrive-solakmirnes.dev@gmail.com/My Drive/octava-backups'
);
const KEY = process.env.BACKUP_KEY || '';

function encrypt(buffer, passphrase) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), body]);
}

async function runFullSync() {
  console.log('======================================================================');
  console.log('☁️ [GoogleDriveSync] Sinhronizacija lokalne MongoDB baze na Google Drive');
  console.log('======================================================================\n');
  
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const collections = await db.listCollections().toArray();
  const dump = { meta: { database: DB_NAME, takenAt: new Date().toISOString(), collections: {} }, data: {} };

  let totalDocs = 0;
  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray();
    dump.data[name] = docs;
    dump.meta.collections[name] = docs.length;
    totalDocs += docs.length;
  }

  const raw = Buffer.from(EJSON.stringify(dump, { relaxed: false }));
  const gzipped = gzipSync(raw, { level: 9 });

  fs.mkdirSync(DRIVE, { recursive: true });

  // 1. Direct-Ready Unencrypted Snapshot for Desktop PC
  const directPath = path.join(DRIVE, 'octava-latest-direct-ready.ejson.gz');
  fs.writeFileSync(directPath, gzipped);

  // 2. Timestamped Encrypted Archive
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const encryptedPayload = KEY ? encrypt(gzipped, KEY) : gzipped;
  const encPath = path.join(DRIVE, `octava-${stamp}.ejson.gz.enc`);
  fs.writeFileSync(encPath, encryptedPayload);

  console.log('✓ Google Drive je 100% AŽURIRAN sa trenutnim stanjem baze!');
  console.log(`  📍 Folder: ${DRIVE}`);
  console.log(`  📦 Snapshot 1: octava-latest-direct-ready.ejson.gz (${(gzipped.length / (1024*1024)).toFixed(2)} MB)`);
  console.log(`  📦 Snapshot 2: octava-${stamp}.ejson.gz.enc (${(encryptedPayload.length / (1024*1024)).toFixed(2)} MB)`);
  console.log(`  📊 Ukupno dokumenata u snapshotu: ${totalDocs}`);
  console.log('\nPregled sinhronizovanih kolekcija:');
  for (const [col, count] of Object.entries(dump.meta.collections)) {
    console.log(`  - ${col.padEnd(16)}: ${count} dokumenata`);
  }

  await client.close();
}

runFullSync().catch(console.error);
