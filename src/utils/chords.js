/**
 * Chord parsing and transposition.
 *
 * Songs are stored as a single ChordPro-style string: chord tokens live inline,
 * wrapped in square brackets, at the exact syllable where the change happens.
 *
 *   [Am]lyric goes [F]here
 *
 * Everything outside brackets is lyric text and is never touched by transposition.
 *
 * Balkan note on notation: ex-Yugoslav (German-derived) theory writes H for B
 * natural and B for B flat. Input in that style is accepted and normalised to
 * Anglo notation on the way in; rendering back out is a display concern, handled
 * by `toGermanNotation`.
 */

const SHARP_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_SCALE  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Keys conventionally written with flats rather than sharps.
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

const CHORD_TOKEN = /\[([^\]]*)\]/g;

// Root note, optional accidental, quality suffix, optional slash bass.
const CHORD_SHAPE = /^([A-H])([#b]?)([^/]*)(?:\/([A-H])([#b]?))?$/;

// A suffix is only a chord quality if it is built entirely from known tokens.
// Without this, [Chorus] parses as C + "horus" and transposes to [Dhorus];
// [Bridge], [Coda] and [Fine] fail the same way.
const CHORD_SUFFIX = /^(?:maj|min|m|M|dim|aug|sus|add|alt|°|ø|\u0394|\+|-|[0-9#b()])*$/;

/** Semitone index for a note name, or -1 if it isn't one. */
function noteToIndex(letter, accidental) {
  // German/Balkan: H is B natural, B alone is B flat.
  if (letter === 'H') return SHARP_SCALE.indexOf('B');

  let base = SHARP_SCALE.indexOf(letter);
  if (base === -1) return -1;

  if (accidental === '#') base += 1;
  else if (accidental === 'b') base -= 1;

  return ((base % 12) + 12) % 12;
}

function indexToNote(index, preferFlats) {
  const scale = preferFlats ? FLAT_SCALE : SHARP_SCALE;
  return scale[((index % 12) + 12) % 12];
}

/** True if a bracket token is a real chord rather than a section marker. */
export function isChord(symbol) {
  const match = CHORD_SHAPE.exec(symbol.trim());
  if (!match) return false;

  const [, letter, accidental, suffix] = match;
  if (suffix && !CHORD_SUFFIX.test(suffix)) return false;

  return noteToIndex(letter, accidental) !== -1;
}

/**
 * Transpose one chord symbol. Returns the input unchanged if it doesn't parse
 * as a chord — annotations like [Chorus] or [x2] pass through untouched.
 */
export function transposeChord(chord, semitones, preferFlats = false) {
  const match = CHORD_SHAPE.exec(chord.trim());
  if (!match) return chord;

  const [, letter, accidental, suffix, bassLetter, bassAccidental] = match;

  if (suffix && !CHORD_SUFFIX.test(suffix)) return chord;

  const rootIndex = noteToIndex(letter, accidental);
  if (rootIndex === -1) return chord;

  let out = indexToNote(rootIndex + semitones, preferFlats) + (suffix || '');

  if (bassLetter) {
    const bassIndex = noteToIndex(bassLetter, bassAccidental);
    if (bassIndex !== -1) {
      out += '/' + indexToNote(bassIndex + semitones, preferFlats);
    }
  }

  return out;
}

/**
 * Transpose every chord token in a song body, leaving lyrics untouched.
 *
 * @param {string} content   ChordPro-style song body
 * @param {number} semitones -11..11, the shift to apply
 * @param {string} [targetKey] used only to decide sharps vs flats in the output
 */
export function transposeContent(content, semitones, targetKey) {
  if (!content) return content;

  const shift = ((semitones % 12) + 12) % 12;
  if (shift === 0) return content;

  const preferFlats = targetKey ? FLAT_KEYS.has(targetKey) : false;

  return content.replace(CHORD_TOKEN, (token, inner) => {
    if (!inner.trim()) return token;
    return '[' + transposeChord(inner, shift, preferFlats) + ']';
  });
}

/** Every distinct chord used in a song, in order of first appearance. */
export function extractChords(content) {
  if (!content) return [];

  const seen = new Set();
  for (const match of content.matchAll(CHORD_TOKEN)) {
    const symbol = match[1].trim();
    if (symbol && isChord(symbol)) seen.add(symbol);
  }
  return [...seen];
}

/** Shift a key name by the same interval, for labelling a transposed song. */
export function transposeKey(key, semitones) {
  if (!key) return key;

  const isMinor = /m$/.test(key) && !/maj/i.test(key);
  const root = isMinor ? key.slice(0, -1) : key;
  const shifted = transposeChord(root, semitones, FLAT_KEYS.has(key));

  return isMinor ? shifted + 'm' : shifted;
}

/** Render Anglo chord names in ex-Yugoslav notation (B natural becomes H). */
export function toGermanNotation(content) {
  if (!content) return content;

  return content.replace(CHORD_TOKEN, (token, inner) => {
    const symbol = inner.trim();
    if (!isChord(symbol)) return token;

    // Single pass: a sequential Bb->B then B->H would re-catch its own output
    // and collapse both spellings onto H.
    const converted = symbol.replace(/B(b?)/g, (_, flat) => (flat ? 'B' : 'H'));

    return '[' + converted + ']';
  });
}
