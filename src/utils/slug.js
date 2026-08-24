/**
 * URL slugs for Bosnian/Serbian/Croatian titles.
 *
 * Unicode NFD strips plain accents but leaves đ and Đ untouched, since they are
 * distinct letters rather than a base letter plus a combining mark. Without the
 * explicit map, "Đurđevdan" would slug to "urevdan".
 */
const LETTERS = { 'đ': 'dj', 'Đ': 'dj', 'ð': 'dj' };

export function slugify(input) {
  if (!input) return '';

  return input
    .replace(/[đĐð]/g, (char) => LETTERS[char])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip combining accents (č ć ž š ...)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/**
 * Appends -2, -3 ... until the slug is free.
 * Two songs can legitimately share a title, so collisions are expected.
 */
export async function uniqueSlug(Model, base, excludeId = null) {
  const root = slugify(base) || 'pjesma';
  let candidate = root;
  let suffix = 1;

  while (true) {
    const query = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    if (!(await Model.exists(query))) return candidate;
    candidate = `${root}-${++suffix}`;
  }
}
