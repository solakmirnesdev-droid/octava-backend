import jwt from 'jsonwebtoken';

/**
 * Readers and editors are separate realms, and the token says which one it
 * belongs to.
 *
 * Without this claim a token minted for a reader would be structurally
 * indistinguishable from one minted for an editor — both are just a subject id
 * — and the only thing standing between the two would be which collection a
 * lookup happened to hit. The realm is verified on every request.
 */
export const REALM_USER = 'user';
export const REALM_STAFF = 'staff';

function secret() {
  const value = process.env.JWT_SECRET;
  // Failing loudly beats signing every token with an empty string.
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

export function signToken(subject, realm, extra = {}) {
  return jwt.sign(
    { sub: subject.toString(), realm, ...extra },
    secret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/** Verifies signature, expiry and realm. A mismatched realm is a rejection. */
export function verifyToken(token, expectedRealm) {
  const payload = jwt.verify(token, secret());

  if (expectedRealm && payload.realm !== expectedRealm) {
    throw new Error('Token realm mismatch');
  }
  return payload;
}
