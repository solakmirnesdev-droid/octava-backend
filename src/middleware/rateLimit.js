import rateLimit from 'express-rate-limit';

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
    const email = (req.body?.email || '').toLowerCase().trim();
    return `${req.ip}:${email}`;
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
