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
 * Notation is ex-Yugoslav throughout: H is the twelfth degree and no flats are
 * ever written. Reading is more permissive than writing — B, H and Bb in a
 * source chart are all understood — but output only ever uses this alphabet.
 */

/**
 * Output alphabet, ex-Yugoslav convention: sharps throughout, and H where the
 * Anglo system writes B. That makes the twelfth degree H and pushes B flat onto
 * A#, so the two systems never collide on the letter B.
 *
 * Input is more forgiving than output — Bb, B and H are all understood when
 * reading a chart, but only this spelling is ever written back.
 */
const SHARP_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];

/**
 * Conventional spelling for every key, following the circle of fifths.
 *
 * Transposing by pitch alone is not enough: A#, D# and G# are correct pitches
 * but nobody writes a chart in them. Db is five flats where C# is seven sharps,
 * so Db wins; C#m is four sharps where Dbm is eight flats, so C#m wins.
 */
const MAJOR_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];
const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Hm'];


/** Splits a key name into its pitch class and mode. */
function parseKey(key) {
  const match = /^([A-H][#b]?)(m(?!aj))?$/.exec((key || '').trim());
  if (!match) return null;

  const [, root, minor] = match;
  const index = noteToIndex(root[0], root[1] || '');
  if (index === -1) return null;

  return { pitchClass: index, isMinor: Boolean(minor) };
}


const CHORD_TOKEN = /\[([^\]]*)\]/g;

// Root note, optional accidental, quality suffix, optional slash bass.
const CHORD_SHAPE = /^([A-H])([#b]?)([^/]*)(?:\/([A-H])([#b]?))?$/;

// A suffix is only a chord quality if it is built entirely from known tokens.
// Without this, [Chorus] parses as C + "horus" and transposes to [Dhorus];
// [Bridge], [Coda] and [Fine] fail the same way.
const CHORD_SUFFIX = /^(?:maj|min|m|M|dim|aug|sus|add|alt|°|ø|\u0394|\+|-|[0-9#b()])*$/;

/** Semitone index for a note name, or -1 if it isn't one. */
function noteToIndex(letter, accidental) {
  // H and a bare B are the same pitch; a flattened B is a semitone below it.
  if (letter === 'H') return 11;
  if (letter === 'B') return accidental === 'b' ? 10 : 11;

  let base = SHARP_SCALE.indexOf(letter);
  if (base === -1) return -1;

  if (accidental === '#') base += 1;
  else if (accidental === 'b') base -= 1;

  return ((base % 12) + 12) % 12;
}

function indexToNote(index) {
  return SHARP_SCALE[((index % 12) + 12) % 12];
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
export function transposeChord(chord, semitones) {
  const match = CHORD_SHAPE.exec(chord.trim());
  if (!match) return chord;

  const [, letter, accidental, suffix, bassLetter, bassAccidental] = match;

  if (suffix && !CHORD_SUFFIX.test(suffix)) return chord;

  const rootIndex = noteToIndex(letter, accidental);
  if (rootIndex === -1) return chord;

  let out = indexToNote(rootIndex + semitones) + (suffix || '');

  if (bassLetter) {
    const bassIndex = noteToIndex(bassLetter, bassAccidental);
    if (bassIndex !== -1) {
      out += '/' + indexToNote(bassIndex + semitones);
    }
  }

  return out;
}

/**
 * Transpose every chord token in a song body, leaving lyrics untouched.
 *
 * @param {string} content       ChordPro-style song body
 * @param {number} semitones     the shift to apply
 * @param {string} [originalKey] the song's own key; the destination key derived
 *                               from it decides sharp versus flat spelling
 */
export function transposeContent(content, semitones, originalKey) {
  if (!content) return content;

  const shift = ((semitones % 12) + 12) % 12;
  if (shift === 0) return content;

  return content.replace(CHORD_TOKEN, (token, inner) => {
    if (!inner.trim()) return token;
    return '[' + transposeChord(inner, shift) + ']';
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

/** The correctly spelled key you land in after shifting by N semitones. */
export function transposeKey(key, semitones) {
  const parsed = parseKey(key);
  if (!parsed) return key;

  const target = (((parsed.pitchClass + semitones) % 12) + 12) % 12;
  return parsed.isMinor ? MINOR_KEYS[target] : MAJOR_KEYS[target];
}

/**
 * Rewrites every chord into the ex-Yugoslav alphabet, leaving pitch untouched.
 *
 * Transposition already respells as a side effect, but a song shown at its
 * original key never passes through it — so anything stored as B, Bb or Eb
 * would keep the spelling it was typed in. This runs on display so the sheet
 * reads the same whatever notation the source used.
 */
export function normalizeNotation(content) {
  if (!content) return content;

  return content.replace(CHORD_TOKEN, (token, inner) => {
    const symbol = inner.trim();
    if (!isChord(symbol)) return token;
    return '[' + transposeChord(symbol, 0) + ']';
  });
}
