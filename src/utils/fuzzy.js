/**
 * Typo-tolerant matching for a small catalogue.
 *
 * AI-DECISION: written here rather than delegated to Atlas Search or a text
 * index. Mongo's `$text` tokenises and stems for languages this catalogue is not
 * written in, and it cannot match a misspelling at all — "bijelo dugne" scores
 * zero against "Bijelo Dugme" however the index is built. Atlas Search would do
 * it, but it is a hosted feature this deployment does not have. With 1570
 * published songs and 137 artists the whole corpus is a few hundred kilobytes of
 * folded text, so scoring it directly is both simpler and exact.
 *
 * Everything here expects text already folded by `slugify` — lower case, no
 * diacritics, spaces between words. Diacritics are therefore NOT a typo class
 * this has to handle: "noc" and "noć" are the same string by the time they
 * arrive. What is left is the mistakes fingers actually make.
 */

/**
 * Damerau-Levenshtein distance, abandoned once it passes `max`.
 *
 * AI-DECISION: Damerau rather than plain Levenshtein, because transposition is
 * the single most common typing error and plain Levenshtein charges two edits
 * for it — "dugem" would score the same distance from "dugme" as a word with two
 * unrelated letters wrong. Counting it as one is the difference between finding
 * the song and offering nothing.
 *
 * The bound matters more than it looks: without it this is O(n·m) against every
 * title in the catalogue. Abandoning a row whose best value already exceeds the
 * threshold turns almost every comparison into a few cells of work, because most
 * titles are nothing like the query.
 */
export function damerau(a, b, max = Infinity) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // A length gap alone already exceeds the budget; no need to fill the table.
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let rowBest = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        current[j - 1] + 1,      // insertion
        prev[j] + 1,             // deletion
        prev[j - 1] + cost       // substitution
      );

      // Transposition: the two characters are swapped relative to each other.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2] + 1);
      }

      current[j] = value;
      if (value < rowBest) rowBest = value;
    }

    if (rowBest > max) return max + 1;

    prev2 = prev;
    prev = current;
    current = new Array(b.length + 1);
  }

  return prev[b.length];
}

/**
 * How many edits a word of this length is allowed before the match is noise.
 *
 * AI-TRAP: a flat threshold is wrong in both directions. Two edits on a
 * four-letter word is half the word — "mrak" would match "brak", "zrak" and
 * "trag" equally, and the reader gets a list that has nothing to do with what
 * they typed. Two edits on a twelve-letter title is a genuine slip. Scaling with
 * length and capping at two keeps both ends honest.
 */
export function budget(length) {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  return 2;
}

export const SCORE = {
  EXACT: 1000,
  PREFIX: 700,
  WORD_PREFIX: 500,
  CONTAINS: 300,
  FUZZY: 200
};

/**
 * Rank one folded target against a folded query. Higher is better, 0 is no match.
 *
 * AI-DECISION: the tiers exist because relevance here is not one number. Somebody
 * typing "bij" wants the thing that STARTS with it, not the most-viewed song that
 * happens to contain those letters in the middle of a word. The old search sorted
 * purely by views, so an exact title match lost to a popular song with an
 * incidental substring — which reads as the search ignoring what was typed.
 */
function phoneticFold(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/đ/g, 'dj')
    .replace(/ž/g, 'z')
    .replace(/[^a-z0-9]/g, '');
}

export function scoreMatch(query, target) {
  if (!query || !target) return 0;
  const qFold = query.trim().toLowerCase();
  const tFold = target.trim().toLowerCase();

  if (tFold === qFold) return SCORE.EXACT;
  if (tFold.startsWith(qFold)) {
    return SCORE.PREFIX + Math.round(100 * (qFold.length / tFold.length));
  }

  const targetWords = tFold.split(' ').filter(Boolean);
  if (targetWords.some((w) => w.startsWith(qFold))) return SCORE.WORD_PREFIX;
  if (tFold.includes(qFold)) return SCORE.CONTAINS;

  // 1. Word-by-word fuzzy matching with typo tolerance
  const queryWords = qFold.split(' ').filter(Boolean);
  if (!queryWords.length) return 0;

  let spent = 0;
  let allWordsMatched = true;

  for (const word of queryWords) {
    let best = Infinity;

    for (const candidate of targetWords) {
      const allowed = budget(Math.max(word.length, candidate.length));

      if (!allowed) {
        if (candidate.startsWith(word) || candidate.includes(word)) { best = 0; break; }
        continue;
      }

      const distance = damerau(word, candidate, allowed);
      if (distance <= allowed && distance < best) best = distance;
      if (best === 0) break;
    }

    if (best === Infinity) {
      allWordsMatched = false;
      break;
    }
    spent += best;
  }

  if (allWordsMatched && queryWords.length > 0) {
    return Math.max(1, SCORE.FUZZY - spent * 40);
  }

  // 2. Collapsed compound matching (e.g. "bjelodugme" -> "Bijelo Dugme", "ribljacorba" -> "Riblja Čorba")
  const qClean = phoneticFold(query);
  const tClean = phoneticFold(target);
  if (tClean.includes(qClean)) return SCORE.CONTAINS;

  const maxLen = Math.max(qClean.length, tClean.length);
  const allowed = Math.min(3, Math.floor(maxLen * 0.25));
  if (allowed > 0) {
    const dist = damerau(qClean, tClean, allowed);
    if (dist <= allowed) {
      return Math.max(1, SCORE.FUZZY - dist * 30);
    }
  }

  return 0;
}
