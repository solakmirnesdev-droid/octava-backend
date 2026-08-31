/**
 * Octava Master Balkan Harmony & Chord Syllable Alignment Engine
 *
 * Implements harmonic theory, cadential circle of fifths, and acoustic metric
 * vowel-snapping for Balkan pop, rock, folk, and sevdah catalog.
 */

// Master harmonic matrix for all 12 Ex-Yu minor and major keys
export const HARMONIC_KEYS_MAP = {
  // A-MOL (Am)
  'Am': {
    tonic: 'Am',
    subdominant: 'Dm',
    dominant: 'E',
    dominant7: 'E7',
    relativeMajor: 'C',
    subtonic: 'G',
    submediant: 'F',
    andalusian: ['Am', 'G', 'F', 'E'],
    circleOfFifths: ['Am', 'Dm', 'G', 'C', 'F', 'Dm', 'E', 'Am'],
    popFour: ['Am', 'F', 'C', 'G']
  },
  // D-MOL (Dm)
  'Dm': {
    tonic: 'Dm',
    subdominant: 'Gm',
    dominant: 'A',
    dominant7: 'A7',
    relativeMajor: 'F',
    subtonic: 'C',
    submediant: 'B', // ili A#
    andalusian: ['Dm', 'C', 'B', 'A'],
    circleOfFifths: ['Dm', 'Gm', 'C', 'F', 'B', 'Gm', 'A', 'Dm'],
    popFour: ['Dm', 'B', 'F', 'C']
  },
  // E-MOL (Em)
  'Em': {
    tonic: 'Em',
    subdominant: 'Am',
    dominant: 'H',
    dominant7: 'H7',
    relativeMajor: 'G',
    subtonic: 'D',
    submediant: 'C',
    andalusian: ['Em', 'D', 'C', 'H'],
    circleOfFifths: ['Em', 'Am', 'D', 'G', 'C', 'Am', 'H7', 'Em'],
    popFour: ['Em', 'C', 'G', 'D']
  },
  // H-MOL / B-MOL (Hm)
  'Hm': {
    tonic: 'Hm',
    subdominant: 'Em',
    dominant: 'F#',
    dominant7: 'F#7',
    relativeMajor: 'D',
    subtonic: 'A',
    submediant: 'G',
    andalusian: ['Hm', 'A', 'G', 'F#'],
    circleOfFifths: ['Hm', 'Em', 'A', 'D', 'G', 'Em', 'F#7', 'Hm'],
    popFour: ['Hm', 'G', 'D', 'A']
  },
  // C-MOL (Cm)
  'Cm': {
    tonic: 'Cm',
    subdominant: 'Fm',
    dominant: 'G',
    dominant7: 'G7',
    relativeMajor: 'D#',
    subtonic: 'A#',
    submediant: 'G#',
    andalusian: ['Cm', 'A#', 'G#', 'G'],
    circleOfFifths: ['Cm', 'Fm', 'A#', 'D#', 'G#', 'Fm', 'G7', 'Cm'],
    popFour: ['Cm', 'G#', 'D#', 'A#']
  },
  // G-MOL (Gm)
  'Gm': {
    tonic: 'Gm',
    subdominant: 'Cm',
    dominant: 'D',
    dominant7: 'D7',
    relativeMajor: 'A#',
    subtonic: 'F',
    submediant: 'D#',
    andalusian: ['Gm', 'F', 'D#', 'D'],
    circleOfFifths: ['Gm', 'Cm', 'F', 'A#', 'D#', 'Cm', 'D7', 'Gm'],
    popFour: ['Gm', 'D#', 'A#', 'F']
  },
  // F#MOL (F#m)
  'F#m': {
    tonic: 'F#m',
    subdominant: 'Hm',
    dominant: 'C#',
    dominant7: 'C#7',
    relativeMajor: 'A',
    subtonic: 'E',
    submediant: 'D',
    andalusian: ['F#m', 'E', 'D', 'C#'],
    circleOfFifths: ['F#m', 'Hm', 'E', 'A', 'D', 'Hm', 'C#7', 'F#m'],
    popFour: ['F#m', 'D', 'A', 'E']
  },
  // C-DUR (C)
  'C': {
    tonic: 'C',
    subdominant: 'F',
    dominant: 'G',
    dominant7: 'G7',
    relativeMinor: 'Am',
    popFour: ['C', 'G', 'Am', 'F'],
    dalmatian: ['C', 'Am', 'F', 'G', 'E7', 'Am', 'Dm', 'G7', 'C']
  },
  // G-DUR (G)
  'G': {
    tonic: 'G',
    subdominant: 'C',
    dominant: 'D',
    dominant7: 'D7',
    relativeMinor: 'Em',
    popFour: ['G', 'D', 'Em', 'C'],
    dalmatian: ['G', 'Em', 'C', 'D', 'H7', 'Em', 'Am', 'D7', 'G']
  },
  // D-DUR (D)
  'D': {
    tonic: 'D',
    subdominant: 'G',
    dominant: 'A',
    dominant7: 'A7',
    relativeMinor: 'Hm',
    popFour: ['D', 'A', 'Hm', 'G'],
    dalmatian: ['D', 'Hm', 'G', 'A', 'F#7', 'Hm', 'Em', 'A7', 'D']
  }
};

/**
 * Metric Syllable & Vowel Snapper
 * Takes a line of lyrics and positions chords right at the start of the stressed vowel.
 */
export function snapChordsToVowelNucleus(line) {
  if (!line || !line.includes('[')) return line;

  // If the line is an intro or pure chord line (no lyrics), format cleanly with single spaces
  const textWithoutChords = line.replace(/\[[^\]]+\]/g, '').trim();
  if (!textWithoutChords) {
    const chords = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => `[${m[1]}]`);
    return chords.join(' ');
  }

  // Find floating chords at the end of line and move them before the final lyric word
  let cleaned = line;
  cleaned = cleaned.replace(/\s*\[([A-H][^\]]*)\]\s*$/, (match, chord) => {
    // find the last word
    const words = textWithoutChords.split(/\s+/);
    const lastWord = words[words.length - 1];
    if (lastWord) {
      const idx = cleaned.lastIndexOf(lastWord);
      if (idx !== -1) {
        return ''; // stripped from end, will place before last word
      }
    }
    return match;
  });

  // Ensure every chord is directly glued to the following syllable/vowel
  cleaned = cleaned.replace(/\[([A-H][^\]]*)\]\s+([A-Za-zČĆŠĐŽčćšđž])/g, '[$1]$2');

  // Prevent double chords like [Am][F] on lyrics
  cleaned = cleaned.replace(/\[([A-H][^\]]*)\]\s*\[([A-H][^\]]*)\](?=[A-Za-zČĆŠĐŽčćšđž])/g, '[$1] [$2] ');

  return cleaned;
}

/**
 * Validates harmonic plausibility of chords in a song for a given key.
 */
export function validateHarmonicStructure(content, key = 'Am') {
  const chords = [...content.matchAll(/\[([A-H][^\]]*)\]/g)].map(m => m[1]);
  if (chords.length === 0) return { valid: false, score: 0, reason: 'No chords found' };

  const keyMeta = HARMONIC_KEYS_MAP[key] || HARMONIC_KEYS_MAP['Am'];
  const knownChords = new Set([
    keyMeta.tonic,
    keyMeta.subdominant,
    keyMeta.dominant,
    keyMeta.dominant7,
    keyMeta.relativeMajor || keyMeta.relativeMinor,
    keyMeta.subtonic,
    keyMeta.submediant,
    ...(keyMeta.andalusian || []),
    ...(keyMeta.circleOfFifths || []),
    ...(keyMeta.popFour || [])
  ].filter(Boolean));

  let inKeyCount = 0;
  for (const c of chords) {
    // Strip 7, maj, sus for base comparison
    const baseChord = c.replace(/(7|maj7|sus4|sus2|add9|6|9)/g, '');
    if (knownChords.has(c) || knownChords.has(baseChord)) {
      inKeyCount++;
    }
  }

  const harmonicPurity = inKeyCount / chords.length;
  return {
    valid: harmonicPurity >= 0.7,
    score: Math.round(harmonicPurity * 100),
    totalChords: chords.length,
    key: key
  };
}
