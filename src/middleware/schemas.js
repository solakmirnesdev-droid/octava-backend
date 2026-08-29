import { z, pagination, text, identifier } from './validate.js';

/**
 * Query shapes for the public listings.
 *
 * `.strict()` is deliberate: an unknown parameter is a typo or a probe, and
 * silently ignoring it is how `?limt=5` looks like it worked.
 */
export const songListQuery = pagination.extend({
  q: text(120).optional(),
  genre: text(80).optional(),
  sort: z.enum(['recent', 'popular', 'title', 'random']).optional(),
  status: z.enum(['published', 'draft', 'all']).optional(),
  tag: text(40).optional()
}).strict();

/*
 * AI-TRAP: `page` belongs here even though search feels like a one-shot lookup.
 * The controller has always paged — it calls readPaging and returns pageMeta —
 * but this schema is `.strict()`, so the dashboard asking for page 2 got a 400
 * and the whole search read as broken. The limit stays lower than the shared
 * `pagination` helper's: this endpoint also feeds the site's suggestion drop-
 * down, where a hundred rows would be the wrong answer.
 */
export const songSearchQuery = z.object({
  q: text(120),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
}).strict();

export const artistListQuery = pagination.extend({
  q: text(120).optional(),
  genre: text(80).optional(),
  // One character after slugging; the alphabet strip sends nothing longer.
  letter: text(4).optional(),
  // ISO 3166-1 alpha-2, or the defunct YU that MusicBrainz still returns for a
  // Yugoslav-era artist. Two letters and nothing else — the codes are matched
  // against a stored field, so anything longer is a caller getting it wrong
  // rather than a query worth running.
  country: z.string().trim().regex(/^[A-Za-z]{2}$/).optional()
}).strict();

export const songDetailQuery = z.object({
  arrangement: z.string().max(40).optional()
}).strict();

export const identifierParam = z.object({ identifier });
export const slugParam = z.object({ slug: identifier });

/* ---------------------------------------------------------------- bodies ---

 * Request bodies, typed.
 *
 * AI-DECISION: these check TYPES, not business rules. Minimum password length,
 * "the two passwords differ", "that email is taken" — all of that stays in the
 * controllers, which already say it in their own words. Moving those checks up
 * here would change the message a caller gets and break the tests that assert
 * on them, for no security gain: the hole was never a short password, it was a
 * password that arrived as an object.
 *
 * AI-TRAP: `.strict()` is the load-bearing part, and it means every field a
 * handler reads has to be listed. `turnstileToken` is not read by any
 * controller — the CAPTCHA middleware takes it off the body — so it looks
 * unused here and is not: leaving it out makes registration fail with
 * "Nepoznat parametar: turnstileToken".
 */

/** A string, and nothing that could be a Mongo operator wearing one's clothes. */
const str = (max = 200) => z.string().max(max);

export const registerBody = z.object({
  email: str(200),
  password: str(200),
  username: str(60).optional(),
  country: str(2).optional().or(z.literal('')),
  turnstileToken: str(4096).optional()
}).strict();

export const loginBody = z.object({
  email: str(200),
  password: str(200)
}).strict();

export const createStaffBody = z.object({
  email: str(200),
  name: str(60),
  // Ranked, so the enum is listed rather than derived: adding a rank should be
  // a deliberate edit here, not something a new model value enables silently.
  role: z.enum(['worker', 'admin', 'superadmin']),
  password: str(200)
}).strict();

export const staffLoginBody = loginBody;

export const staffVerifyBody = z.object({
  challenge: str(2048),
  code: str(64)
}).strict();

export const challengeBody = z.object({
  challenge: str(2048)
}).strict();

export const googleBody = z.object({
  credential: str(4096)
}).strict();

export const forgotBody = z.object({
  email: str(200),
  realm: z.enum(['user', 'staff']).optional(),
  turnstileToken: str(4096).optional()
}).strict();

export const resetBody = z.object({
  token: str(512),
  password: str(200),
  realm: z.enum(['user', 'staff']).optional()
}).strict();

/* Second factor. Each handler reads some of password/code; one schema for all
 * of them would have to make both optional and check nothing. */
/*
 * Optional, deliberately.
 *
 * AI-TRAP: making these required turns "you did not send a password" into a 400
 * from the schema, when the controller answers it with a 401 and the sentence
 * "Pogrešna lozinka." A test caught the change immediately — but the point is
 * broader than the test: presence is a business rule and belongs where the
 * message lives. What the schema is here to stop is a password that arrives as
 * `{ "$ne": null }`, and `.optional()` still refuses that.
 */
export const codeBody = z.object({ code: str(64).optional() }).strict();
export const passwordBody = z.object({ password: str(200).optional() }).strict();
export const passwordCodeBody = z.object({
  password: str(200).optional(),
  code: str(64).optional()
}).strict();
