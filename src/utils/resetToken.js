import crypto from 'node:crypto';

/**
 * Password reset tokens.
 *
 * The raw token goes in the email and is never stored; only its hash is kept.
 * A leaked database therefore yields no working reset links — the same reason
 * passwords are hashed. SHA-256 is enough here without bcrypt's cost, because
 * the token is 32 random bytes rather than something a person chose.
 */
const BYTES = 32;
const TTL_MINUTES = 60;

export function createResetToken() {
  const raw = crypto.randomBytes(BYTES).toString('base64url');
  return {
    raw,
    hash: hashResetToken(raw),
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000)
  };
}

export const hashResetToken = (raw) =>
  crypto.createHash('sha256').update(String(raw)).digest('hex');

export const RESET_TTL_MINUTES = TTL_MINUTES;
