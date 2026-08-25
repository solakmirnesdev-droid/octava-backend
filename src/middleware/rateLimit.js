import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';

/**
 * Throttles credential endpoints.
 *
 * Without this, an attacker can try passwords as fast as the network allows,
 * and bcrypt only makes each attempt expensive for us — not for them, since
 * they are not the ones paying for the hashing. The limit is per address and
 * per account, so one noisy address cannot lock out an unrelated user.
 */
const message = { message: 'Previše pokušaja. Pokušaj ponovo za nekoliko minuta.' };

/** Counts only failures, so a person signing in repeatedly is never punished. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
  keyGenerator: (req) => {
    // Pairing the address with the account being tried means spraying one
    // password across many accounts is throttled as well as hammering one.
    //
    // The address must go through ipKeyGenerator rather than being used raw:
    // an IPv6 client is normally handed a whole /64, so keying on the exact
    // address would give an attacker billions of distinct buckets and no
    // limit at all. The helper collapses the prefix to a single key.
    const email = (req.body?.email || '').toLowerCase().trim();
    return `${ipKeyGenerator(req.ip)}:${email}`;
  }
});

/** Registration is cheap to abuse and rarely repeated by one person. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message
});

/** A wider net over everything under /api/auth, to blunt distributed attempts. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message
});

/**
 * Second-factor attempts.
 *
 * Keyed on the account the challenge names rather than on the address alone.
 * The verify request carries no email, so an address-only key would put every
 * editor behind one office connection into a single bucket — and one person
 * fumbling a code would lock out the rest.
 *
 * The challenge is decoded without verification, which is safe here: it only
 * chooses a counter. A forged token buys an attacker their own bucket, not a
 * larger allowance.
 */
export const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
  keyGenerator: (req) => {
    const subject = (() => {
      try {
        return jwt.decode(req.body?.challenge)?.sub || 'anon';
      } catch {
        return 'anon';
      }
    })();
    return `2fa:${ipKeyGenerator(req.ip)}:${subject}`;
  }
});
