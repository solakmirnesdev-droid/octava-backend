/**
 * Guitar fingerings for the chord tooltip.
 *
 * Positions run low E to high E. A number is a fret, 0 is an open string and
 * null is a string that is not played. `barre` marks a fret held across several
 * strings, and `baseFret` shifts the diagram up the neck for shapes that do not
 * start at the nut.
 *
 * Names follow the ex-Yugoslav alphabet used everywhere else here: H is the
 * twelfth degree, and there are no flats.
 */

const OPEN = (frets, extra = {}) => ({ frets, baseFret: 1, ...extra });

/** E-shape barre: root on the sixth string. */
const eBarre = (fret, minor = false) => ({
  frets: minor
    ? [fret, fret + 2, fret + 2, fret, fret, fret]
    : [fret, fret + 2, fret + 2, fret + 1, fret, fret],
  barre: { fret, from: 0, to: 5 },
  baseFret: fret
});

/** A-shape barre: root on the fifth string. */
const aBarre = (fret, minor = false) => ({
  frets: minor
    ? [null, fret, fret + 2, fret + 2, fret + 1, fret]
    : [null, fret, fret + 2, fret + 2, fret + 2, fret],
  barre: { fret, from: 1, to: 5 },
  baseFret: fret
});

export const FINGERINGS = {
  // Major triads
  'C':  OPEN([null, 3, 2, 0, 1, 0]),
  'C#': aBarre(4),
  'D':  OPEN([null, null, 0, 2, 3, 2]),
  'D#': aBarre(6),
  'E':  OPEN([0, 2, 2, 1, 0, 0]),
  'F':  eBarre(1),
  'F#': eBarre(2),
  'G':  OPEN([3, 2, 0, 0, 0, 3]),
  'G#': eBarre(4),
  'A':  OPEN([null, 0, 2, 2, 2, 0]),
  'A#': aBarre(1),
  'H':  aBarre(2),

  // Minor triads
  'Cm':  aBarre(3, true),
  'C#m': aBarre(4, true),
  'Dm':  OPEN([null, null, 0, 2, 3, 1]),
  'D#m': aBarre(6, true),
  'Em':  OPEN([0, 2, 2, 0, 0, 0]),
  'Fm':  eBarre(1, true),
  'F#m': eBarre(2, true),
  'Gm':  eBarre(3, true),
  'G#m': eBarre(4, true),
  'Am':  OPEN([null, 0, 2, 2, 1, 0]),
  'A#m': aBarre(1, true),
  'Hm':  aBarre(2, true),

  // Dominant sevenths, the ones that actually turn up in these songs
  'C7': OPEN([null, 3, 2, 3, 1, 0]),
  'D7': OPEN([null, null, 0, 2, 1, 2]),
  'E7': OPEN([0, 2, 0, 1, 0, 0]),
  'G7': OPEN([3, 2, 0, 0, 0, 1]),
  'A7': OPEN([null, 0, 2, 0, 2, 0]),
  'H7': OPEN([null, 2, 1, 2, 0, 2]),

  // Minor sevenths
  'Am7': OPEN([null, 0, 2, 0, 1, 0]),
  'Dm7': OPEN([null, null, 0, 2, 1, 1]),
  'Em7': OPEN([0, 2, 0, 0, 0, 0]),

  // Suspended
  'Dsus4': OPEN([null, null, 0, 2, 3, 3]),
  'Asus4': OPEN([null, 0, 2, 2, 3, 0]),
  'Esus4': OPEN([0, 2, 2, 2, 0, 0]),
  'Csus4': OPEN([null, 3, 3, 0, 1, 1])
};

/** Interval formula, shown so the shape is not just a picture to copy. */
const FORMULAS = {
  '':      { label: 'dur',        formula: '1 - 3 - 5' },
  'm':     { label: 'mol',        formula: '1 - b3 - 5' },
  '7':     { label: 'septakord',  formula: '1 - 3 - 5 - b7' },
  'm7':    { label: 'mol 7',      formula: '1 - b3 - 5 - b7' },
  'maj7':  { label: 'veliki 7',   formula: '1 - 3 - 5 - 7' },
  'sus4':  { label: 'sus4',       formula: '1 - 4 - 5' },
  'sus2':  { label: 'sus2',       formula: '1 - 2 - 5' },
  'dim':   { label: 'umanjeni',   formula: '1 - b3 - b5' },
  'aug':   { label: 'prekomjerni', formula: '1 - 3 - #5' },
  '6':     { label: 'sekstakord', formula: '1 - 3 - 5 - 6' },
  'm6':    { label: 'mol 6',      formula: '1 - b3 - 5 - 6' },
  'add9':  { label: 'add9',       formula: '1 - 3 - 5 - 9' }
};

const ROOT = /^([A-H][#b]?)(.*)$/;

/**
 * Looks up a shape for a chord symbol.
 *
 * Falls back through the slash bass and then the plain triad, so an
 * unrecognised extension still shows something playable rather than nothing:
 * a guitarist reading Am9 is better served by the Am shape than by a blank.
 */
export function findFingering(symbol) {
  if (!symbol) return null;

  const clean = symbol.trim();
  const exact = FINGERINGS[clean];
  if (exact) return { ...exact, name: clean, ...describe(clean) };

  // Slash chords: the shape is the chord before the slash.
  const base = clean.split('/')[0];
  if (base !== clean && FINGERINGS[base]) {
    return { ...FINGERINGS[base], name: base, approximate: true, ...describe(base) };
  }

  // Anything else: drop the extension back to the bare triad.
  const match = ROOT.exec(base);
  if (!match) return null;

  const [, root, suffix] = match;
  const triad = root + (/^m(?!aj)/.test(suffix) ? 'm' : '');

  return FINGERINGS[triad]
    ? { ...FINGERINGS[triad], name: triad, approximate: true, ...describe(clean) }
    : null;
}

function describe(symbol) {
  const match = ROOT.exec(symbol.split('/')[0]);
  if (!match) return { formula: null, quality: null };

  const suffix = match[2] || '';
  const entry = FORMULAS[suffix] || FORMULAS[/^m(?!aj)/.test(suffix) ? 'm' : ''];
  return { quality: entry?.label || null, formula: entry?.formula || null };
}
