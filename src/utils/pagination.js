const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/** Reads page/limit from a query string, clamped to sane bounds. */
export function readPaging(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(total, { page, limit }) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}
