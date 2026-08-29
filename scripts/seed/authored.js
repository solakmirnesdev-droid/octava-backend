/**
 * Mirnes's own songs: his lyrics, his chords, his arrangements.
 *
 * Nothing here is anybody else's work, which is what separates this file from
 * the rest of the catalogue. The demo entries carry lorem ipsum because a real
 * transcription is not ours to publish; these carry real words because the
 * person who wrote them is the person seeding them.
 *
 * AI-TRAP: `artist` is the performer the entry is FILED UNDER, and it is not
 * necessarily the author. Filing an authored song under a real singer is a
 * deliberate demo device — Mirnes wants to see his song rendered the way a
 * Kaliopi or Aco Pejović entry renders — but the resulting row states, in a
 * public catalogue, that a living person recorded a song they have never heard.
 * Every such entry is tagged `demo-atribucija` so the claim is greppable and
 * one query undoes it:
 *
 *   db.songs.find({ tags: 'demo-atribucija' })
 *
 * They default to `status: 'draft'` for the same reason. Publishing one is a
 * decision, not a default. See AI-NOTES.md §5 (2026-08-29).
 *
 * Field shape:
 *
 *   title        his title — keep it his, see the note on replacesSlug below
 *   artist       performer to file under; created if unknown
 *   author       who actually wrote it, when that differs from `artist`
 *   genres       genre slugs, e.g. ['domaca', 'pop']
 *   originalKey  the SOUNDING key; chords in `content` are sounding too
 *   capo         a suggestion for where to clamp, never baked into the symbols
 *   difficulty   'easy' | 'medium' | 'hard'
 *   status       'draft' (default) | 'published'
 *   content      ChordPro: [Am]chords inline at the syllable, [Refren] sections
 *   replacesSlug optional — reuse an existing demo row instead of adding one,
 *                so the catalogue count stays put and the artist link is kept
 *   keepTitle    optional — with replacesSlug, keep the demo row's real title
 *                instead of his. Off by default: a real title over his words
 *                claims to be the chart for a specific recording, which is a
 *                sharper falsehood than the artist line alone.
 */
export const AUTHORED = [
  // Songs land here as Mirnes sends them.
];
