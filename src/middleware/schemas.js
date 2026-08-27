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

export const songSearchQuery = z.object({
  q: text(120),
  limit: z.coerce.number().int().min(1).max(50).default(10)
}).strict();

export const artistListQuery = pagination.extend({
  q: text(120).optional(),
  genre: text(80).optional(),
  // One character after slugging; the alphabet strip sends nothing longer.
  letter: text(4).optional()
}).strict();

export const songDetailQuery = z.object({
  arrangement: z.string().max(40).optional()
}).strict();

export const identifierParam = z.object({ identifier });
export const slugParam = z.object({ slug: identifier });
