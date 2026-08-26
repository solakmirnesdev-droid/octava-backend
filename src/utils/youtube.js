/**
 * Pulls the video id out of whatever a person pasted.
 *
 * The dashboard asks for a link because that is what is in the clipboard after
 * "copy link" — nobody carries a bare eleven-character id around. Only the id
 * is stored: it is the stable part, and every URL form is a wrapper around it.
 *
 * Embedding is the sanctioned way to show someone else's recording. The player
 * comes from YouTube, counts toward the rightsholder's views and carries their
 * advertising; nothing is copied here.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;

const PATTERNS = [
  /[?&]v=([A-Za-z0-9_-]{11})/,        // watch?v=
  /youtu\.be\/([A-Za-z0-9_-]{11})/,   // short link
  /\/embed\/([A-Za-z0-9_-]{11})/,     // already an embed
  /\/shorts\/([A-Za-z0-9_-]{11})/,    // shorts
  /\/live\/([A-Za-z0-9_-]{11})/       // live
];

/**
 * Returns the id, or null when there is nothing usable.
 *
 * An empty string is meaningful and distinct from null: it is how the editor
 * says "remove the video I set earlier".
 */
export function youtubeId(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return '';

  if (ID.test(value)) return value;

  for (const pattern of PATTERNS) {
    const m = value.match(pattern);
    if (m) return m[1];
  }
  return null;
}
