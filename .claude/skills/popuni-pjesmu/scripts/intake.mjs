/**
 * Turns a pasted chord chart into the ChordPro body Octava stores, using the
 * project's own chords.js so the notation cannot drift from what the app prints.
 *
 *   node .claude/skills/popuni-pjesmu/scripts/intake.mjs <file> [--key Am] [--capo 2]
 *
 * Accepts either shape:
 *   - chords on their own line above the lyric line (the usual paste)
 *   - already-inline [Am]like [F]this
 */
import fs from 'node:fs';
import {
  extractChords, normalizeNotation, isChord, transposeKey
} from '../../../../src/utils/chords.js';

const [, , file, ...rest] = process.argv;
const flag = (name) => {
  const i = rest.indexOf('--' + name);
  return i === -1 ? null : rest[i + 1];
};

const raw = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
const lines = raw.split('\n');

/** A line is a chord line if every whitespace-separated token parses as a chord. */
const isChordLine = (line) => {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => isChord(t));
};

/** Section markers: "Refren", "Refren:", "[Refren]", "Strofa 2". */
const SECTION = /^\[?\s*(uvod|intro|strofa|refren|chorus|verse|solo|most|bridge|kraj|outro|pretrefren)\b[^\]]*\]?\s*:?\s*$/i;

/** Chord tokens with their starting column, so they land on the right syllable. */
const placements = (line) => {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) out.push({ chord: m[0], col: m.index });
  return out;
};

/** Merges a chord line into the lyric line beneath it. */
function merge(chordLine, lyricLine) {
  const spots = placements(chordLine);
  if (!spots.length) return lyricLine;

  // Insert from the right, so earlier columns are not shifted by later inserts.
  let out = lyricLine;
  for (let i = spots.length - 1; i >= 0; i--) {
    const { chord, col } = spots[i];
    const at = Math.min(col, out.length);
    out = out.slice(0, at) + '[' + chord + ']' + out.slice(at);
  }
  return out;
}

const body = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (SECTION.test(line.trim())) {
    const name = line.trim().replace(/^\[|\]$/g, '').replace(/:$/, '').trim();
    body.push('[' + name.charAt(0).toUpperCase() + name.slice(1) + ']');
    continue;
  }

  if (isChordLine(line)) {
    const next = lines[i + 1];
    // A chord line with lyrics under it belongs to them; one standing alone is
    // an intro or a solo and stays as a bar line.
    if (next !== undefined && next.trim() && !isChordLine(next) && !SECTION.test(next.trim())) {
      body.push(merge(line, next));
      i++;
    } else {
      body.push(line.trim().split(/\s+/).map((c) => '[' + c + ']').join('  '));
    }
    continue;
  }

  body.push(line.replace(/\s+$/, ''));
}

// Collapse runs of blank lines to one, and normalise Bb/B to A#/H on the way out.
const content = normalizeNotation(
  body.join('\n').replace(/\n{3,}/g, '\n\n').trim()
);

const chords = extractChords(content);
const key = flag('key');
const capo = Number(flag('capo') || 0);

console.log('----- content -----');
console.log(content);
console.log('----- report -----');
console.log('chords      :', chords.join(' ') || '(none)');
if (key) {
  console.log('originalKey :', key, '(sounding key — chords above are sounding too)');
  if (capo) {
    console.log('capo        :', capo, '=> shapes fingered in', transposeKey(key, -capo));
    console.log('              key stays', key + '; capo moves shapes only.');
  }
}
const flats = content.match(/\[[^\]]*b[^\]]*\]/g);
if (flats) console.log('WARN flats  :', [...new Set(flats)].join(' '));
const bare = content.match(/\[B(?![b#])[^\]]*\]/g);
if (bare) console.log('WARN B used :', [...new Set(bare)].join(' '), '- should print as H');
