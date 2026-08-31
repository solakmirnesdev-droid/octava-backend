/**
 * Restores a backup produced by scripts/backup.js.
 *
 *   node scripts/restore.js <file> [--into <database>] [--force]
 *
 * Defaults to a scratch database rather than the live one. Restoring is the
 * half of a backup that is never rehearsed, and rehearsing it must not be able
 * to destroy the data it is meant to protect — overwriting the working
 * database requires --force and says so first.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import { gunzipSync } from 'node:zlib';
import crypto from 'node:crypto';
import fs from 'node:fs';

const [, , file, ...rest] = process.argv;

if (!file) {
  console.error('Usage: node scripts/restore.js <file> [--into <database>] [--force]');
  process.exit(1);
}

const intoIndex = rest.indexOf('--into');
const target = intoIndex !== -1 ? rest[intoIndex + 1] : 'octava_restore_check';
const force = rest.includes('--force');

const URI = process.env.MONGODB_URI;
const liveName = new URL(URI.replace('mongodb://', 'http://')).pathname.slice(1) || 'octava';

if (target === liveName && !force) {
  console.error(`Refusing to overwrite the live database "${liveName}" without --force.`);
  console.error('Restore into a scratch database first and compare, then repeat with --force.');
  process.exit(1);
}

function decrypt(buffer, passphrase) {
  const salt = buffer.subarray(0, 16);
  const iv = buffer.subarray(16, 28);
  const tag = buffer.subarray(28, 44);
  const body = buffer.subarray(44);

  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  // Throws if the passphrase is wrong or the file was altered — the whole
  // point of an authenticated cipher.
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

const client = new MongoClient(URI);

try {
  let payload = fs.readFileSync(file);

  if (file.endsWith('.enc')) {
    const key = process.env.BACKUP_KEY;
    if (!key) throw new Error('This archive is encrypted; set BACKUP_KEY to read it.');
    payload = decrypt(payload, key);
  }

  const dump = EJSON.parse(gunzipSync(payload).toString());

  await client.connect();
  const db = client.db(target);

  console.log('Restoring into "' + target + '"');
  console.log('  taken at: ' + dump.meta.takenAt);

  let restored = 0;
  for (const [name, docs] of Object.entries(dump.data)) {
    await db.collection(name).deleteMany({});
    if (docs.length) {
      const CHUNK = 500;
      for (let i = 0; i < docs.length; i += CHUNK) {
        await db.collection(name).insertMany(docs.slice(i, i + CHUNK), { ordered: false });
      }
    }

    const actual = await db.collection(name).countDocuments();
    const expected = dump.meta.collections[name];
    const ok = actual === expected;

    console.log(`  ${ok ? 'ok  ' : 'MISMATCH'} ${name.padEnd(14)} ${actual}/${expected}`);
    if (!ok) process.exitCode = 1;
    restored += actual;
  }

  console.log('  ' + restored + ' documents restored');
} catch (err) {
  console.error('Restore failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
