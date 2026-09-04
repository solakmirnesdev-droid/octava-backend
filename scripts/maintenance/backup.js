/**
 * Database backup, written where a cloud folder will sync it off the machine.
 *
 *   node scripts/backup.js
 *
 * Uses the MongoDB driver already present through mongoose rather than
 * mongodump, which would need a 120MB toolchain this machine has no room for.
 * Collections are serialised as Extended JSON, which preserves ObjectId and
 * Date rather than flattening them to strings the way plain JSON would — a
 * restore has to reproduce the documents exactly, not approximately.
 *
 * Encryption is on by default. The dump contains TOTP secrets, and anyone
 * holding one can generate valid second-factor codes indefinitely; password
 * hashes are bcrypt and far less useful to a thief, but the secrets are not.
 * Set BACKUP_KEY to a passphrase and keep it somewhere other than the backup:
 * without it the archive cannot be read, including by you.
 */
import { ciljanaBaza, backupKljuc } from '../lib/sweep.js';

/*
 * AI-TRAP: this used `import 'dotenv/config'`, which reads .env and nothing
 * else — so `--atlas` was ignored and the backup silently captured the LOCAL
 * catalogue. Backing up the wrong database before a production write is worse
 * than not backing up at all, because it looks like a safety net.
 */
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import { gzipSync } from 'node:zlib';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { atlas: NA_ATLASU, uri: URI } = ciljanaBaza();
const DB_NAME = new URL(URI.replace('mongodb://', 'http://')).pathname.slice(1) || 'octava';

const DRIVE = path.join(
  os.homedir(),
  'Library/CloudStorage/GoogleDrive-solakmirnes.dev@gmail.com/My Drive/octava-backups'
);
const DEST = process.env.BACKUP_DIR || DRIVE;
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 30;

const KEY = backupKljuc(NA_ATLASU);

/**
 * A backup without a key is refused, not written.
 *
 * AI-DECISION: this used to fall through to an unencrypted file and say so in
 * one line of output nobody reads. Twenty-eight archives accumulated on Google
 * Drive that way — the whole catalogue, every password hash and every TOTP
 * secret, readable with `gzcat`. A backup that silently drops its encryption is
 * worse than one that fails, because the failure is the only thing that would
 * have made somebody look.
 *
 * `--allow-plaintext` exists for the one honest case: a throwaway dump of a
 * local database that holds nothing worth protecting.
 */
if (!KEY && !process.argv.includes('--allow-plaintext')) {
  console.error('BACKUP_KEY nije postavljen — backup bi bio nešifrovan i sadrži');
  console.error('lozinke i TOTP tajne. Postavi ga u .env.dev / .env.prod,');
  console.error('ili pokreni s --allow-plaintext ako baš to hoćeš.');
  process.exit(1);
}

/** AES-256-GCM: encrypts and authenticates, so tampering is detectable. */
function encrypt(buffer, passphrase) {
  const salt = crypto.randomBytes(16);
  // scrypt rather than a raw hash: deliberately slow, so a weak passphrase is
  // still expensive to attack offline.
  const key = crypto.scryptSync(passphrase, salt, 32);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(buffer), cipher.final()]);

  // salt | iv | authTag | ciphertext
  return Buffer.concat([salt, iv, cipher.getAuthTag(), body]);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const client = new MongoClient(URI);

try {
  await client.connect();
  const db = client.db(DB_NAME);

  const collections = await db.listCollections().toArray();
  const dump = { meta: { database: DB_NAME, takenAt: new Date().toISOString(), collections: {} }, data: {} };

  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray();
    dump.data[name] = docs;
    dump.meta.collections[name] = docs.length;
  }

  const raw = Buffer.from(EJSON.stringify(dump, { relaxed: false }));
  const gzipped = gzipSync(raw, { level: 9 });

  const encrypted = Boolean(KEY);
  const payload = encrypted ? encrypt(gzipped, KEY) : gzipped;
  const filename = `octava-${stamp}.ejson.gz${encrypted ? '.enc' : ''}`;

  fs.mkdirSync(DEST, { recursive: true });
  const target = path.join(DEST, filename);
  fs.writeFileSync(target, payload);

  // A write that was never read back is not yet a backup.
  const written = fs.statSync(target).size;
  if (written !== payload.length) throw new Error('Written size does not match the payload');

  console.log('Backup written');
  console.log('  file:      ' + target);
  console.log('  size:      ' + (written / 1024).toFixed(1) + ' KB'
    + ' (from ' + (raw.length / 1024).toFixed(1) + ' KB raw)');
  console.log('  encrypted: ' + (encrypted ? 'yes' : 'NO — set BACKUP_KEY'));
  for (const [name, count] of Object.entries(dump.meta.collections)) {
    console.log('    ' + name.padEnd(14) + count);
  }

  // Rotation. Only files this script produced are ever considered.
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const entry of fs.readdirSync(DEST)) {
    if (!/^octava-.*\.ejson\.gz(\.enc)?$/.test(entry)) continue;
    const full = path.join(DEST, entry);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      removed++;
    }
  }
  if (removed) console.log('  pruned:    ' + removed + ' older than ' + KEEP_DAYS + ' days');
} catch (err) {
  console.error('Backup failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
