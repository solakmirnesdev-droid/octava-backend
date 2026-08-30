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

/**
 * Counters live in this process's memory, so they survive across tests even
 * though the database is wiped between them — which made unrelated tests fail
 * on a throttle they never triggered themselves. Limiting is exercised by its
 * own suite, which opts back in explicitly.
 */
const disabled = process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT !== 'on';
const passthrough = (_req, _res, next) => next();

const limiter = (options) => (disabled ? passthrough : rateLimit(options));

/**
 * Counts only failures, so a person signing in repeatedly is never punished.
 *
 * AI-DECISION: the window is an hour rather than fifteen minutes. Ten guesses
 * per hour per address-and-account is a far tighter ceiling on password
 * spraying, and the cost of that is carried by whoever gets it wrong ten times
 * in a row — who now waits an hour rather than a quarter of one.
 *
 * AI-TRAP: the counters live in this process's memory, so restarting the API
 * clears every lockout instantly. That is the way out in development and it is
 * NOT one in production behind more than one instance, where a locked-out
 * editor waits the full hour. Lengthening this window without a reset path for
 * staff is what makes that an hour of nothing to do — see resetController's
 * `staff` realm, which is the only door left open.
 */
export const loginLimiter = limiter({
  windowMs: 60 * 60 * 1000,
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
export const registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message
});

/** A wider net over everything under /api/auth, to blunt distributed attempts. */
export const authLimiter = limiter({
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
export const twoFactorLimiter = limiter({
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

/**
 * Reader-authored content: reviews and replies.
 *
 * Keyed on the account rather than the address, because this is the one thing
 * on the site where the abuse worth stopping comes from someone signed in. An
 * address key would also throttle a whole household or café to one review.
 *
 * The window is generous on purpose — someone writing thoughtfully about six
 * songs in an evening is the behaviour we want, not the behaviour we guard
 * against. What it stops is a script posting hundreds.
 */
export const contentLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
  keyGenerator: (req) => (req.user ? `user:${req.user._id}` : ipKeyGenerator(req.ip))
});

/**
 * The desk.
 *
 * These endpoints sit behind a staff session, so the threat is not a stranger
 * hammering them — it is a loop in a script somebody wrote against the API, or
 * a token that has leaked. A bulk edit touches up to 500 songs per call and an
 * import walks the whole catalogue, so unbounded is the wrong default even
 * among people you trust.
 *
 * AI-TRAP: keyed by address, not by account, and that is deliberate. This is
 * mounted at the application level, ahead of requireStaff, so req.staff does
 * not exist yet. Decoding the token here to get an id would mean trusting it
 * unverified — and anyone who can forge one gets a fresh bucket per forgery,
 * which is no limit at all. contentLimiter can key per account because it is
 * mounted per route, after the session is resolved.
 *
 * Set well above what a person clicking through the tool ever reaches.
 */
export const staffLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 5000,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
  keyGenerator: (req) => ipKeyGenerator(req.ip)
});

/**
 * Everything a signed-out visitor can reach.
 *
 * Search runs a regex against the catalogue, so it is the cheapest request to
 * make and one of the more expensive to serve. This is a ceiling on volume, set
 * far above what reading the site looks like.
 */
/**
 * A stored image, by URL.
 *
 * AI-TRAP: the artist grid renders 125 cards, each pulling its own portrait, so
 * one page load is ~126 requests. Against the 120/min ceiling below that meant
 * a screen which throttled itself: the images at the bottom 429'd, and so did
 * the next write — saving an edited artist came back 429 with no explanation.
 * Images are not what that ceiling protects. They are a stored blob served
 * straight from the document, already sent with a day of Cache-Control and an
 * ETag, so they get their own bucket and are skipped by the one below.
 */
const isStoredImage = (req) =>
  req.method === 'GET' && /\/artists\/[^/]+\/image(\?|$)/.test(req.originalUrl);

export const imageLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 2000,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
  keyGenerator: (req) => ipKeyGenerator(req.ip)
});

export const publicLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 2400,
  skip: (req) => isStoredImage(req) || req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
  keyGenerator: (req) => ipKeyGenerator(req.ip)
});
