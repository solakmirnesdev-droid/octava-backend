/**
 * What counts as an incomplete song, for anything that ranks or displays one.
 *
 * AI-DECISION: this lives in src/utils rather than scripts/lib because the API
 * needs it and `src/` must not reach into `scripts/`. The quality rules
 * themselves stay in scripts/lib/kvalitet.js — that module writes the flags,
 * this one interprets them — and it re-exports these two so there is still a
 * single definition.
 */

/**
 * The flags a reader actually feels, as opposed to the ones only an editor sees.
 *
 * AI-DECISION: ranking and badges use THIS list, never `quality.score`. The
 * score is a tidiness measure — a double space costs four points — and a song
 * with a stray space is exactly as useful to somebody holding a guitar as one
 * without. What hurts a reader is different in kind: no chords over a verse, a
 * verse that stops halfway, no lyrics at all, or a label with a chord driven
 * through it so the page renders wrong.
 */
export const SMETA_CITAOCU = [
  'prazna-pjesma',
  'kratak-tekst',
  'sekcija-bez-akorda',
  'bez-sekcija',
  'kvar-u-oznaci'
];

/** Is this song missing something a reader would notice? */
export function nepotpuna(quality) {
  return (quality?.flags || []).some((f) => SMETA_CITAOCU.includes(f));
}

/** The reader-facing flags this song carries, for a page that wants to say so. */
export function stoFali(quality) {
  return (quality?.flags || []).filter((f) => SMETA_CITAOCU.includes(f));
}
