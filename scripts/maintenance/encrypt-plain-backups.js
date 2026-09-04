/**
 * Encrypts backup archives that were written in the clear.
 *
 *   node scripts/maintenance/encrypt-plain-backups.js            # dry run
 *   node scripts/maintenance/encrypt-plain-backups.js --apply    # writes
 *
 * AI-DECISION: written because twenty-eight archives had accumulated on Google
 * Drive unencrypted — the whole catalogue, every password hash and every TOTP
 * secret, readable with `gzcat`. `backup.js` fell through to its plaintext
 * branch whenever BACKUP_KEY was missing, and the launchd job that runs it
 * hourly had no environment at all. Both are fixed; these are the archives left
 * behind.
 *
 * AI-TRAP: none of them has an encrypted counterpart, so they are the only copy
 * of the points in time they hold. Each one is encrypted, decrypted again and
 * compared byte for byte before the plaintext is removed — a backup destroyed
 * while being protected would be the worst possible outcome of a fix like this.
 *
 * `octava-latest-direct-ready.ejson.gz` is left alone deliberately: it is
 * written unencrypted on purpose, as a restore that needs no key. It carries
 * the same secrets, so it is worth a decision — but not a silent one taken here.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { backupKljuc } from '../lib/sweep.js';

const DRIVE = path.join(
  os.homedir(),
  'Library/CloudStorage/GoogleDrive-solakmirnes.dev@gmail.com/My Drive/octava-backups'
);
const DEST = process.env.BACKUP_DIR || DRIVE;
const apply = process.argv.includes('--apply');
const KEY = backupKljuc(true);

if (!KEY) {
  console.error('BACKUP_KEY nije pronađen — bez njega nema čime šifrovati.');
  process.exit(1);
}

/** Byte-for-byte the format backup.js writes and restore.js reads. */
function encrypt(buffer, passphrase) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), body]);
}

function decrypt(buffer, passphrase) {
  const salt = buffer.subarray(0, 16);
  const iv = buffer.subarray(16, 28);
  const tag = buffer.subarray(28, 44);
  const body = buffer.subarray(44);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

const GZIP = Buffer.from([0x1f, 0x8b]);

const plain = fs.readdirSync(DEST)
  .filter((f) => /^octava-.*\.ejson\.gz$/.test(f))
  .filter((f) => !f.includes('direct-ready'));

// Named without .enc is the signal; the gzip magic bytes below are the proof.
// A file that is already ciphertext must never be encrypted a second time.

let done = 0;
let skipped = 0;
let bytes = 0;

for (const name of plain) {
  const from = path.join(DEST, name);
  const to = `${from}.enc`;

  const head = Buffer.alloc(2);
  const fd = fs.openSync(from, 'r');
  fs.readSync(fd, head, 0, 2, 0);
  fs.closeSync(fd);

  if (!head.equals(GZIP)) { skipped += 1; continue; }
  if (fs.existsSync(to)) { skipped += 1; continue; }

  const size = fs.statSync(from).size;
  bytes += size;

  if (!apply) {
    console.log(`  ${name}  ->  ${name}.enc  (${(size / 1024 / 1024).toFixed(1)} MB)`);
    done += 1;
    continue;
  }

  const raw = fs.readFileSync(from);
  const sealed = encrypt(raw, KEY);

  // Proved readable before the only copy is removed.
  if (!decrypt(sealed, KEY).equals(raw)) {
    console.error(`  ${name}: provjera nije prošla — plaintext OSTAJE`);
    continue;
  }

  fs.writeFileSync(to, sealed);
  fs.unlinkSync(from);
  console.log(`  ${name}  šifrovan i provjeren`);
  done += 1;
}

console.log('');
console.log(`arhiva u čistom tekstu : ${done}`);
console.log(`preskočeno             : ${skipped}`);
console.log(`ukupno                 : ${(bytes / 1024 / 1024).toFixed(0)} MB`);
if (!apply) console.log('\nPROBNI PROLAZ — ništa nije promijenjeno. Dodaj --apply.');
