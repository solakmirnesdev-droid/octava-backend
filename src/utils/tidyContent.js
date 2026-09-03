/**
 * Normalises the whitespace and stray punctuation an import leaves behind.
 *
 * AI-DECISION: applied on write rather than on display. A chart is read far
 * more often than it is saved, and a reader is not the person who should pay
 * for an importer's formatting — but more than that, the mess is searchable:
 * a doubled space inside a line is a word boundary the text index tokenises
 * around, so leaving it in makes the lyric unfindable by the phrase it is.
 *
 * AI-TRAP: chord-only lines are left exactly as they are. An instrumental run
 * is written `[Am]  [F]  [C]` and the two spaces are load-bearing — chordpro.js
 * separates the bars on them, and a chord symbol is wider than one space, so
 * collapsing them collides the run into an unreadable smear. Measured against
 * the catalogue this case never actually occurs, which is precisely why a rule
 * that only worked by luck would go unnoticed.
 */

/** A line whose every bracket is stripped and nothing but spaces remains. */
const isChordOnly = (line) => line.replace(/\[[^\]]*\]/g, '').trim() === '';

/**
 * A tablature row. Strip the chords and what is left is notation, never words.
 *
 * AI-TRAP: tab rows must NOT go through the whitespace pass, and learning that
 * cost 52 songs on both databases. `-{2,}` collapses to a space and ` {2,}` to
 * one, so `|--0---------|-----0-0-0--|` became `| 0 | 0-0-0 |`, and a row that
 * was all dashes became `| | | |`. Verified against the 2026-08-30 backup:
 * decimen, zastave and klatno each lost their tab, and zastave lost an [F]
 * with it. The fret numbers survive; the dashes are the timing, and the timing
 * is the half that cannot be guessed back.
 *
 * Measured before it was trusted: 514 songs, 2,262 rows. The only rows here
 * carrying letters spell `xxxx`, which is tab for a muted string. No lyric
 * line matches, because a lyric line has a word in it.
 */
export const isTabLine = (line) => {
  const bare = line.replace(/\[[^\]]*\]/g, '');
  if (!bare.includes('|') || !/[-\d]/.test(bare)) return false;
  if (!/^[\s|.\-\d~^*()/\\xhpbrst]*$/i.test(bare)) return false;
  return (bare.match(/\|/g) || []).length >= 2 || (bare.match(/-/g) || []).length >= 3;
};

export function tidyContent(content) {
  if (!content) return content;

  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (isChordOnly(line) || isTabLine(line)) return line.replace(/\s+$/, '');

      return line
        // A tab is a doubled space wearing a different hat.
        .replace(/\t/g, ' ')
        /*
         * Runs of dashes, in the two shapes an import produces: a rule across
         * the line, and dashes standing in for the spaces between words. A
         * single dash is left alone — "crno-bijeli" is one word.
         */
        .replace(/-{2,}/g, ' ')
        .replace(/ {2,}/g, ' ')
        // A space before punctuation is never intended.
        .replace(/ +([,.;:!?])/g, '$1')
        .replace(/\s+$/, '');
    })
    .join('\n')
    // Three blank lines say nothing the second one did not.
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
