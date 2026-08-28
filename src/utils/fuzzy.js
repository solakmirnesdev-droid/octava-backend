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
export function scoreMatch(query, target) {
  if (!query || !target) return 0;
  if (target === query) return SCORE.EXACT;
  if (target.startsWith(query)) {
    // Among prefix matches the shorter target is the better answer: "mrak" beats
    // "mrakovi neki drugi" for the query "mrak".
    return SCORE.PREFIX + Math.round(100 * (query.length / target.length));
  }

  const targetWords = target.split(' ').filter(Boolean);
  if (targetWords.some((w) => w.startsWith(query))) return SCORE.WORD_PREFIX;
  if (target.includes(query)) return SCORE.CONTAINS;

  /*
   * Fuzzy, word by word.
   *
   * AI-TRAP: comparing the whole query to the whole title does not work. The
   * distance from "dugne" to "bijelo dugme" is nine — the length gap alone — so a
   * single mistyped word inside a long title scores as no match at all. Every
   * query word is matched against its best target word instead, and a query only
   * survives if all of its words land somewhere.
   */
  const queryWords = query.split(' ').filter(Boolean);
  if (!queryWords.length) return 0;

  let spent = 0;
  for (const word of queryWords) {
    let best = Infinity;

    for (const candidate of targetWords) {
      /*
       * AI-TRAP: the budget is taken from the LONGER of the two words, not from
       * the one that was typed. A dropped letter makes the query word shorter
       * than what it meant — "hri" for "hari" — and budgeting on the typed
       * length gave it three characters, which scores zero tolerance, so
       * "hari mata hri" found nothing at all. Measuring against the candidate
       * too means a truncated word is still judged as the word it was aiming at.
       */
      const allowed = budget(Math.max(word.length, candidate.length));

      if (!allowed) {
        // Genuinely short on both sides: too little to guess from, so it has to
        // appear as written.
        if (candidate.startsWith(word)) { best = 0; break; }
        continue;
      }

      const distance = damerau(word, candidate, allowed);
      if (distance <= allowed && distance < best) best = distance;
      if (best === 0) break;
    }

    // Nothing in the title could be what this word was reaching for.
    if (best === Infinity) return 0;
    spent += best;
  }

  // Every edit the reader is forgiven costs the result some rank, so a clean
  // match always outranks a corrected one.
  return Math.max(1, SCORE.FUZZY - spent * 40);
}
