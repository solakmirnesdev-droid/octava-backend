/**
 * Reduces a song title to a key two spellings of the same song share.
 *
 * MusicBrainz carries whatever contributors typed, so one recording arrives as
 * "Bele ruze" and "Bele ruže", "By Pass" and "Bypass", or with a straight
 * apostrophe in one entry and a curly one in another. Importers compared exact
 * titles and let all of it through.
 *
 * AI-TRAP: strip Latin accents, never every non-Latin character. A fold ending
 * in `replace(/[^a-z0-9]/g, '')` reduces a Cyrillic title to an empty string,
 * which collapses every Cyrillic-titled song onto one key — a deduplication
 * pass built on that would delete all but one of them.
 */
export function foldTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}]/gu, '');
}
