/**
 * Converts the "chords on their own line, above the words" layout that every
 * printed songbook uses into the inline bracket notation this app stores.
 *
 *     Am        F
 *     tekst ide ovdje        ->  [Am]tekst ide [F]ovdje
 *
 * The mapping is purely positional: a chord starting at column N belongs to
 * whatever character sits at column N of the line beneath it.
 */
import { isChord } from './chords.js';

// Written as "Refren:", "REFREN", "[Refren]" or "Refren -" in the wild.
const SECTION_WORDS = [
  'uvod', 'strofa', 'refren', 'solo', 'most', 'bridge', 'kraj', 'outro',
  'intro', 'pretrefren', 'instrumental', 'zavrsetak', 'završetak', 'coda'
];

const TAB_WIDTH = 4;

/** Tabs would shift every column mapping, so they are expanded first. */
function expandTabs(line) {
  let out = '';
  for (const char of line) {
    if (char === '\t') out += ' '.repeat(TAB_WIDTH - (out.length % TAB_WIDTH));
    else out += char;
  }
  return out;
}

/** A line is a chord line only if every token on it is a chord. */
function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  // A lone chord letter over a lyric is ambiguous with the word "a" or "i";
  // requiring the whole line to parse as chords resolves it.
  return tokens.every((token) => isChord(token.replace(/^\[|\]$/g, '')));
}

function detectSection(line) {
  const cleaned = line.trim().replace(/^\[|\]$/g, '').replace(/[:.\-–—]+$/, '').trim();
  if (!cleaned || cleaned.length > 30) return null;

  const first = cleaned.toLowerCase().split(/\s+/)[0];
  return SECTION_WORDS.includes(first) ? cleaned : null;
}

/** Chord symbols with the column each one starts at. */
function readChordPositions(line) {
  const positions = [];
  const pattern = /\S+/g;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    positions.push({ chord: match[0].replace(/^\[|\]$/g, ''), column: match.index });
  }
  return positions;
}

/**
 * Moves an insertion point off the middle of a word.
 *
 * Songbook alignment is approximate — a chord printed two characters into a
 * word belongs at that word's start, not splitting it. Snapping to whichever
 * boundary is nearer turns "na[F]d gradom" into "[F]nad gradom", which is what
 * the source actually meant.
 */
function snapToWord(text, index) {
  if (index <= 0 || index >= text.length) return Math.max(0, Math.min(index, text.length));

  // Landing on a gap: the chord was printed over whitespace, so it belongs to
  // the word that follows rather than trailing the one before it.
  if (/\s/.test(text[index])) {
    let forward = index;
    while (forward < text.length && /\s/.test(text[forward])) forward++;
    return forward < text.length ? forward : index;
  }

  const insideWord = /\S/.test(text[index]) && /\S/.test(text[index - 1]);
  if (!insideWord) return index;

  let start = index;
  while (start > 0 && /\S/.test(text[start - 1])) start--;

  let next = index;
  while (next < text.length && /\S/.test(text[next])) next++;
  while (next < text.length && /\s/.test(text[next])) next++;

  // Nothing follows, so there is no forward word to snap to; a chord parked
  // past the last character belongs on the word it was printed over.
  if (next >= text.length) return start;

  // Otherwise prefer the current word unless the next one is strictly closer.
  return (next - index) < (index - start) ? next : start;
}

/**
 * Splices chords into a lyric line at their columns.
 * Inserting right-to-left keeps earlier offsets valid as the string grows.
 */
function merge(chords, lyric) {
  let out = lyric;
  let lastAt = Infinity;

  for (const { chord, column } of [...chords].reverse()) {
    let at = snapToWord(out, Math.min(column, out.length));

    // Two chords snapping onto the same word would stack; keep them distinct.
    if (at >= lastAt) at = Math.max(0, Math.min(column, out.length));
    lastAt = at;

    out = out.slice(0, at) + '[' + chord + ']' + out.slice(at);
  }
  return out;
}

/**
 * @param {string} input raw pasted song text
 * @returns {{ content: string, chords: string[], warnings: string[] }}
 */
export function convertToChordPro(input) {
  if (!input?.trim()) return { content: '', chords: [], warnings: [] };

  const lines = input.replace(/\r\n?/g, '\n').split('\n').map(expandTabs);
  const out = [];
  const warnings = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      // Collapse runs of blank lines to one.
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }

    const section = detectSection(line);
    if (section && !isChordLine(line)) {
      out.push('[' + section + ']');
      continue;
    }

    if (isChordLine(line)) {
      const chords = readChordPositions(line);
      chords.forEach((c) => seen.add(c.chord));

      const next = lines[i + 1];
      const nextIsLyric = next !== undefined && next.trim() && !isChordLine(next)
        && !detectSection(next);

      if (nextIsLyric) {
        out.push(merge(chords, next));
        i++;
      } else {
        // An instrumental run with no words under it stays on its own line.
        out.push(chords.map((c) => '[' + c.chord + ']').join('  '));
      }
      continue;
    }

    out.push(line.trimEnd());
  }

  if (!seen.size) {
    warnings.push('Nijedan akord nije prepoznat — provjeri da li su akordi u zasebnom redu iznad teksta.');
  }

  return {
    content: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    chords: [...seen],
    warnings
  };
}

/**
 * Guesses the key from the chords used.
 *
 * Songs overwhelmingly resolve to their tonic, so the last chord is the best
 * single signal; the first chord breaks ties. Only a guess, and the editor
 * lets a worker override it.
 */
export function guessKey(content) {
  const matches = [...content.matchAll(/\[([^\]]+)\]/g)]
    .map((m) => m[1].trim())
    .filter(isChord);

  if (!matches.length) return null;

  const root = (chord) => /^([A-H][#b]?)(m(?!aj))?/.exec(chord);
  const last = root(matches[matches.length - 1]);
  const first = root(matches[0]);

  const pick = last || first;
  if (!pick) return null;

  return pick[1] + (pick[2] ? 'm' : '');
}
