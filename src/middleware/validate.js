import { z } from 'zod';

/**
 * Schema checking for query strings, bodies and route params.
 *
 * Three separate problems close here at once, all of them measured:
 *
 *   ?q[$ne]=       → 500, because a Mongo operator object reached the query
 *   ?limit=100000  → the whole catalogue in one response, 128 KB and growing
 *   unknown fields → accepted silently and carried into documents
 *
 * Express 5 makes req.query a getter, so the parsed value is stashed on
 * req.valid rather than assigned back over it.
 */
export function validate({ query, body, params } = {}) {
  return (req, res, next) => {
    req.valid = req.valid || {};

    for (const [key, schema, source] of [
      ['query', query, req.query],
      ['body', body, req.body],
      ['params', params, req.params]
    ]) {
      if (!schema) continue;

      const result = schema.safeParse(source);
      if (!result.success) {
        const first = result.error.issues[0];
        return res.status(400).json({
          message: describe(first),
          field: first.path.join('.') || key
        });
      }
      req.valid[key] = result.data;

      /**
       * Hand the parsed value back where the controllers already look.
       *
       * Validating into req.valid alone would leave every controller reading
       * the raw string — the limit ceiling would pass its check and then be
       * ignored, which is worse than no ceiling because it looks enforced.
       * Express 5 defines req.query as a getter, so it is redefined rather
       * than assigned.
       */
      if (key === 'query') {
        Object.defineProperty(req, 'query', {
          value: result.data, writable: true, configurable: true, enumerable: true
        });
      } else if (key === 'body') {
        req.body = result.data;
      }
    }

    next();
  };
}


/**
 * Zod speaks English; the rest of the API answers in Bosnian. Only the codes a
 * caller can actually trigger are translated — anything else falls through to
 * the original text rather than being papered over with a vague message.
 */
function describe(issue) {
  const field = issue.path.join('.') || 'polje';

  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'object'
        // What ?q[$ne]= produces: a nested object where a word was expected.
        ? `Parametar „${field}" mora biti tekst.`
        : `Parametar „${field}" je neispravnog tipa.`;
    case 'too_big':
      return `Parametar „${field}" prelazi najveću dozvoljenu vrijednost (${issue.maximum}).`;
    case 'too_small':
      return `Parametar „${field}" je ispod najmanje dozvoljene vrijednosti (${issue.minimum}).`;
    case 'unrecognized_keys':
      return `Nepoznat parametar: ${(issue.keys || []).join(', ')}.`;
    case 'invalid_value':
    case 'invalid_enum_value':
      return `Parametar „${field}" ima nedozvoljenu vrijednost.`;
    default:
      return issue.message;
  }
}

/* ------------------------------------------------------------ building blocks */

/**
 * A user-supplied string and nothing else.
 *
 * The point of the explicit type check: `?q[$ne]=` arrives as an object, and
 * without this it travels all the way to Mongo.
 */
export const text = (max = 200) =>
  z.string().max(max).trim();

/** Pagination with a ceiling, because "give me everything" is not a page. */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Neispravan identifikator.');

/** An id or a slug — how songs, artists and genres are addressed. */
export const identifier = z.string().min(1).max(140);

export { z };
