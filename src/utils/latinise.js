/**
 * Cyrillic to Latin, in the alphabet this site is written in.
 *
 * AI-DECISION: the catalogue is Latin script, everywhere, without exception.
 * MusicBrainz stores Macedonian and Russian recordings in Cyrillic, so titles
 * arrived that way; separately, a single Cyrillic 'а' had crept into a Bosnian
 * lyric, where it was invisible to the eye and made the word unsearchable.
 * Both are the same problem and get the same answer. See AI-NOTES.md §5.
 *
 * The output is Gaj's Latin — š, č, ž, đ — not the English digraphs. "Девушка"
 * becomes "Devuška", not "Devushka", because that is how the rest of the site
 * spells it and how a reader here would type it.
 */

/**
 * One table for Serbian, Macedonian and Russian.
 *
 * The three alphabets agree on the letters they share, so a combined table is
 * safe and means callers never have to guess which language a string is in.
 */
const TABLE = {
  // Shared across all three.
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'ž', з: 'z', и: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', ш: 'š',

  // Serbian and Macedonian.
  ј: 'j', љ: 'lj', њ: 'nj', џ: 'dž',
  ђ: 'đ', ћ: 'ć',
  ѓ: 'gj', ќ: 'kj', ѕ: 'dz',

  // Russian.
  ё: 'jo', й: 'j', щ: 'šč', ы: 'i', э: 'e', ю: 'ju', я: 'ja',
  // The hard and soft signs carry no sound of their own in Latin script.
  ъ: '', ь: '',

  // Accented forms that turn up in Macedonian orthography.
  ѐ: 'e', ѝ: 'i'
};

const CYRILLIC = /[Ѐ-ӿԀ-ԯ]/;

/** Whether a string carries any Cyrillic at all. */
export function hasCyrillic(text) {
  return typeof text === 'string' && CYRILLIC.test(text);
}

/**
 * Converts one letter, matching the case of the source.
 *
 * AI-TRAP: a capital that maps to a digraph has two right answers. "Љубав" is
 * "Ljubav" but "ЉУБАВ" is "LJUBAV", so the following letter decides — writing
 * "LJubav" or "Ljubav" for the wrong one both look like bugs.
 */
function convert(ch, next) {
  const lower = ch.toLowerCase();
  const latin = TABLE[lower];
  if (latin === undefined) return null;

  if (ch === lower) return latin;
  if (latin.length <= 1) return latin.toUpperCase();

  const nextIsUpper = next
    && TABLE[next.toLowerCase()] !== undefined
    && next !== next.toLowerCase();

  return nextIsUpper ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
}

/**
 * Rewrites every Cyrillic letter, leaving everything else exactly as it was.
 *
 * Punctuation, spacing and Latin text pass through untouched, which is what
 * makes this safe to run over a whole lyric sheet: a stray homoglyph is fixed
 * and the other 900 characters are not rewritten around it.
 */
export function toLatin(text) {
  if (typeof text !== 'string' || !CYRILLIC.test(text)) return text;

  let out = '';
  for (let i = 0; i < text.length; i++) {
    const mapped = convert(text[i], text[i + 1]);
    out += mapped === null ? text[i] : mapped;
  }
  return out;
}

/** Every Cyrillic run in a string, with its position. For reporting. */
export function findCyrillic(text) {
  if (typeof text !== 'string') return [];
  return [...text.matchAll(/[Ѐ-ӿԀ-ԯ]+/g)].map((m) => ({
    index: m.index,
    text: m[0],
    latin: toLatin(m[0])
  }));
}
