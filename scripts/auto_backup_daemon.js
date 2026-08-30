import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import { gzipSync } from 'node:zlib';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localBackupsDir = path.join(__dirname, '../backups');

const DRIVE_DIR = path.join(
  os.homedir(),
  'Library/CloudStorage/GoogleDrive-solakmirnes.dev@gmail.com/My Drive/octava-backups'
);
const DEST = process.env.BACKUP_DIR || DRIVE_DIR;
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 14;
const KEY = process.env.BACKUP_KEY || '';

function encrypt(buffer, passphrase) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), body]);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function createAtlasGoogleDriveBackup() {
  const URI = process.env.MONGODB_URI;
  if (!URI) {
    throw new Error('MONGODB_URI is not defined in environment');
  }

  const client = new MongoClient(URI);
  try {
    await client.connect();
    const db = client.db('octava');

    console.log('[AutoBackup] Kreiram snapshot sa Atlas cloud baze direktno na Google Drive...');
    const collections = await db.listCollections().toArray();
    const dump = {
      meta: {
        database: 'octava',
        source: 'MongoDB Atlas',
        takenAt: new Date().toISOString(),
        collections: {}
      },
      data: {}
    };

    let totalDocs = 0;
    for (const { name } of collections) {
      if (name.startsWith('system.')) continue;
      const docs = await db.collection(name).find({}).toArray();
      dump.data[name] = docs;
      dump.meta.collections[name] = docs.length;
      totalDocs += docs.length;
    }

    const raw = Buffer.from(EJSON.stringify(dump, { relaxed: false }));
    const gzipped = gzipSync(raw, { level: 9 });

    // Ensure directories exist
    fs.mkdirSync(DEST, { recursive: true });
    fs.mkdirSync(localBackupsDir, { recursive: true });

    // 1. Direct-Ready unencrypted snapshot for instant restore
    const directPath = path.join(DEST, 'octava-latest-direct-ready.ejson.gz');
    fs.writeFileSync(directPath, gzipped);

    // 2. Timestamped encrypted archive on Google Drive
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const encryptedPayload = KEY ? encrypt(gzipped, KEY) : gzipped;
    const encPath = path.join(DEST, `octava-${stamp}.ejson.gz.enc`);
    fs.writeFileSync(encPath, encryptedPayload);

    // 3. Local copy in project /backups/
    const localPath = path.join(localBackupsDir, `octava_${stamp}.ejson.gz`);
    fs.writeFileSync(localPath, gzipped);

    console.log(`🔒 [AutoBackup] Atlas snapshot uspješno sačuvan na Google Drive!`);
    console.log(`   📁 Google Drive: ${encPath} (${(gzipped.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`   📊 Ukupno dokumenata: ${totalDocs} (${dump.meta.collections.songs || 0} songs, ${dump.meta.collections.artists || 0} artists)`);

    // Clean up older backups (> KEEP_DAYS)
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    let pruned = 0;
    if (fs.existsSync(DEST)) {
      for (const entry of fs.readdirSync(DEST)) {
        if (!/^octava-.*\.ejson\.gz(\.enc)?$/.test(entry)) continue;
        const full = path.join(DEST, entry);
        if (fs.statSync(full).mtimeMs < cutoff) {
          fs.unlinkSync(full);
          pruned++;
        }
      }
    }
    if (pruned > 0) {
      console.log(`   🗑️ [AutoBackup] Obrisano ${pruned} starih backup-a (> ${KEEP_DAYS} dana).`);
    }
  } finally {
    await client.close();
  }
}

async function runDaemon() {
  console.log('======================================================================');
  console.log('☁️ [AutoBackupDaemon] Atlas -> Google Drive automatski backup servis');
  console.log('======================================================================\n');
  console.log(`Interval: Svaka 2 sata | Destinacija: ${DEST}\n`);

  // Initial immediate backup
  try {
    await createAtlasGoogleDriveBackup();
  } catch (err) {
    console.error('[AutoBackup Initial Error]', err.message);
  }

  // Continuous 2-hour loop
  while (true) {
    await delay(2 * 60 * 60 * 1000);
    try {
      await createAtlasGoogleDriveBackup();
    } catch (err) {
      console.error('[AutoBackup Daemon Error]', err.message);
    }
  }
}

process.on('uncaughtException', (err) => {
  console.error('[AutoBackup UncaughtException]', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[AutoBackup UnhandledRejection]', reason);
});

if (process.argv[1]?.endsWith('auto_backup_daemon.js')) {
  runDaemon().catch(console.error);
}
