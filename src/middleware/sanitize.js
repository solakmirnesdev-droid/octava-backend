/**
 * Strips Mongo operators out of anything a caller sends.
 *
 * AI-DECISION: written here instead of pulling in express-mongo-sanitize. That
 * package works and is MIT, but it assigns over `req.query`, which Express 5
 * defines as a getter — and this codebase is already written for that upgrade
 * (see validate.js, which uses defineProperty for exactly this reason). Adding a
 * dependency that breaks on a migration the project is already preparing for is
 * a trade with nothing on the other side, and the whole thing is twenty lines.
 *
 * AI-NOTE: this is the SECOND layer, not the first. The schemas in schemas.js
 * are what actually refuse a bad request, with a 400 and a sentence explaining
 * which field. This one silently drops operators on every route, including the
 * ones nobody has written a schema for yet — it is the floor, not the wall.
 */

/** `$gt`, `$where`, and dotted paths, which reach into subdocuments. */
const OPERATOR = /^\$/;
const DOTTED = /\./;

/** Prototype pollution rides in on the same shape and is worth a separate stop. */
const POISON = new Set(['__proto__', 'constructor', 'prototype']);

// Deeply nested input is cheap to send and expensive to walk; a limit keeps a
// hostile body from turning into a stack overflow.
const MAX_DEPTH = 12;

function clean(value, depth = 0) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (POISON.has(key) || OPERATOR.test(key) || DOTTED.test(key)) continue;
    out[key] = clean(item, depth + 1);
  }
  return out;
}

export function sanitize(req, _res, next) {
  if (req.body) req.body = clean(req.body);
  if (req.params) req.params = clean(req.params);

  if (req.query) {
    // Assigning would throw on Express 5, where query is a getter.
    Object.defineProperty(req, 'query', {
      value: clean(req.query), writable: true, configurable: true, enumerable: true
    });
  }

  next();
}
