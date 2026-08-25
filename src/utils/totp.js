import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Time-based one-time passwords for editorial accounts.
 *
 * Chosen over SMS deliberately: an authenticator app costs nothing per login,
 * works without signal, and is not vulnerable to SIM swapping — which is the
 * attack SMS second factors actually face.
 */
const ISSUER = 'Octava';
const DIGITS = 6;
const PERIOD = 30;

/**
 * Accept the neighbouring step in each direction.
 *
 * Phone and server clocks drift, and a code typed at the very end of its
 * window arrives after it. One step is +/-30 seconds, which covers ordinary
 * skew without meaningfully widening the guessing window.
 */
const WINDOW = 1;

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 5;

function buildTotp(secret, label) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',   // what every authenticator app supports
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret)
  });
}

export function generateSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** The otpauth:// URI an authenticator app scans, rendered as a data URI. */
export async function buildQrCode(secret, label) {
  const uri = buildTotp(secret, label).toString();
  const dataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
  return { uri, dataUrl };
}

/**
 * Validates a code and returns the counter it matched, or null.
 *
 * The counter is returned rather than a boolean so the caller can refuse a
 * code that has already been used: without that, anyone who observes a code
 * has thirty seconds to replay it.
 */
export function verifyCode(secret, label, code, lastUsedCounter = null) {
  const cleaned = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return null;

  const delta = buildTotp(secret, label).validate({ token: cleaned, window: WINDOW });
  if (delta === null) return null;

  const counter = Math.floor(Date.now() / 1000 / PERIOD) + delta;
  if (lastUsedCounter !== null && counter <= lastUsedCounter) return null;

  return counter;
}

/**
 * Single-use codes for when the phone is lost.
 *
 * Returned in the clear exactly once, then stored hashed — they are passwords
 * in every respect that matters, and a database leak must not hand over a way
 * past the second factor.
 */
export async function generateBackupCodes() {
  const plain = Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase()
  );
  const hashed = await Promise.all(plain.map((code) => bcrypt.hash(code, 10)));
  return { plain, hashed };
}

/** Consumes a backup code, returning the remaining hashes or null. */
export async function consumeBackupCode(code, hashes = []) {
  const cleaned = String(code || '').replace(/[\s-]/g, '').toUpperCase();
  if (!cleaned) return null;

  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(cleaned, hashes[i])) {
      return hashes.filter((_, index) => index !== i);
    }
  }
  return null;
}
