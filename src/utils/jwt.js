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

/**
 * The token handed out between password and second factor.
 *
 * A realm of its own, and short-lived, because it proves only that the
 * password was correct. Reusing the staff realm here would make step one a
 * complete login and the second factor decorative.
 */
export const REALM_STAFF_CHALLENGE = 'staff-2fa';
export const CHALLENGE_TTL = '5m';

function secret() {
  const value = process.env.JWT_SECRET;
  // Failing loudly beats signing every token with an empty string.
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

export function signToken(subject, realm, extra = {}, expiresIn = null) {
  return jwt.sign(
    /*
     * AI-DECISION: `iatMs` alongside the standard `iat`.
     *
     * `iat` is seconds by spec, and session invalidation compares it against
     * passwordChangedAt. At second granularity a password changed in the same
     * second the token was issued left the old session alive — a one-second
     * window, but on precisely the action taken when somebody believes they are
     * compromised. Tightening the comparison to `<=` instead would reject the
     * *new* token too and sign the person out the moment they changed it.
     */
    { sub: subject.toString(), realm, iatMs: Date.now(), ...extra },
    secret(),
    { expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/** Signs the short-lived token that carries a login between its two steps. */
export const signChallenge = (subject) =>
  signToken(subject, REALM_STAFF_CHALLENGE, {}, CHALLENGE_TTL);

/** Verifies signature, expiry and realm. A mismatched realm is a rejection. */
export function verifyToken(token, expectedRealm) {
  /*
   * AI-DECISION: the algorithm is pinned rather than inferred. jsonwebtoken
   * already refuses `alg: none` for a string secret, so this changes nothing
   * today — it removes the possibility that a future version, or a key that
   * stops being a plain string, quietly widens what counts as a valid
   * signature. A token is trusted on the strength of this line.
   */
  const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });

  if (expectedRealm && payload.realm !== expectedRealm) {
    throw new Error('Token realm mismatch');
  }
  return payload;
}
