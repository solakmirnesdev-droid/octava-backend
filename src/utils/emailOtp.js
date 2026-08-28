import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * One-time codes delivered by email, as a second factor.
 *
 * AI-DECISION: offered alongside the authenticator rather than instead of it.
 * TOTP is the stronger factor — it needs no network and cannot be intercepted in
 * transit — but it also assumes the person has set up an app and still has the
 * phone they set it up on. Email is the factor somebody can always use, and a
 * second factor nobody can complete is just a locked account. See AI-NOTES.md.
 *
 * AI-TRAP: a six-digit code is a million possibilities, which sounds like a lot
 * and is not. Without an attempt cap an attacker holding a valid challenge can
 * simply keep guessing, and the whole factor is decorative. The cap below is the
 * load-bearing part of this file, not the entropy.
 */
const DIGITS = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

/**
 * A code, and its hash for storage.
 *
 * crypto.randomInt, not Math.random: the latter is seeded predictably enough
 * that codes issued close together are guessable from one another.
 */
export async function makeOtp() {
  const plain = String(crypto.randomInt(0, 10 ** DIGITS)).padStart(DIGITS, '0');
  return { plain, hash: await bcrypt.hash(plain, 10), expires: new Date(Date.now() + OTP_TTL_MS) };
}

/**
 * Checks a submitted code against what is stored.
 *
 * Returns a verdict rather than a boolean so the caller can tell the three
 * failures apart — expired, wrong, and out of attempts each need a different
 * sentence, and treating them alike either leaks nothing or explains nothing.
 */
export async function checkOtp(submitted, { hash, expires, attempts = 0 }) {
  if (!hash || !expires) return 'none';
  if (attempts >= MAX_ATTEMPTS) return 'locked';
  if (Date.now() > new Date(expires).getTime()) return 'expired';

  const cleaned = String(submitted || '').replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(cleaned)) return 'wrong';

  return (await bcrypt.compare(cleaned, hash)) ? 'ok' : 'wrong';
}

/** The message body. Plain text only — a code does not need a layout. */
export function otpMessage(code) {
  return {
    subject: `Kod za prijavu: ${code}`,
    text: [
      `Tvoj kod za prijavu je: ${code}`,
      '',
      'Vrijedi 10 minuta i može se upotrijebiti jednom.',
      'Ako se nisi ti prijavljivao, promijeni lozinku — neko zna tvoju trenutnu.'
    ].join('\n')
  };
}
