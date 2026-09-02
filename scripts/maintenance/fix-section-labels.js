/**
 * Unpicks chord rows that got fused with a section label.
 *
 *   node scripts/maintenance/fix-section-labels.js            # sample, nothing is written
 *   node scripts/maintenance/fix-section-labels.js --sample 30
 *   node scripts/maintenance/fix-section-labels.js --write
 *
 * The wreck looks like this — a chord row and a label occupying one line, with
 * one chord trapped inside the label's brackets:
 *
 *     [Strofa 1]                        <- the good label, already there
 *     [Hm][Strofa [G]1]     [D]   [A]   <- the wreck
 *
 * and in its worse form:
 *
 *     [Strofa]]]]]]]]]]]] [E] 1] [F#m] [D]
 *
 * Both carry real chords. The repair keeps every chord, in order, and drops
 * the label only when the line above already carries the same one.
 *
 * AI-NOTE: the label vocabulary (strofa, refren, uvod, kraj, prelaz) and the
 * labels this script writes back are song content, not code. They stay in
 * Bosnian — translating them would rewrite every arrangement in the catalogue.
 *
 * AI-DECISION: this lives apart from `katalog.js popravi` and stays dry until
 * asked, because it is the one repair that can silently move chords. It was
 * written only after sampling the matches: the rule that first found this
 * counted 3,564 songs, and 2,609 of those were "[Prelaz / Solo]:" — a healthy
 * label with a colon. The real number is 600. See CATALOG.md §5.
 */
import 'dotenv/config';
import Song from '../../src/models/Song.js';
import '../../src/models/Artist.js';
import { connect, sweep } from '../lib/sweep.js';

const WRITE = process.argv.includes('--write');
const SAMPLE = Number(argOf('--sample') || 12);

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

const LABEL = /\[(strofa|refren|uvod|kraj|prelaz)[^\]\n]*\[|\[(strofa|refren)\]{2,}/i;
const CHORD = /^[A-H][#b]?(?:m|maj|min|dim|aug|sus|add)?\d{0,2}(?:\/[A-H][#b]?)?$/;

/**
 * Rebuild one broken line into { label, chords }.
 * Returns null when the line is not actually broken.
 */
function splitLine(line) {
  if (!LABEL.test(line)) return null;

  // every bracketed token on the line, in the order it appears
  const tokens = [...line.matchAll(/\[([^\[\]]*)\]/g)].map((m) => m[1].trim());
  const chords = tokens.filter((t) => CHORD.test(t));

  /*
   * The label survives as plain text once its brackets are broken, so read the
   * word and its number straight off the line rather than out of the tokens.
   */
  const found = /(strofa|refren|uvod|kraj|prelaz)/i.exec(line);
  if (!found) return null;
  const word = found[1][0].toUpperCase() + found[1].slice(1).toLowerCase();

  /*
   * AI-TRAP: take the number from AFTER the label word, never the first digit
   * on the line. Chords carry digits too — [C#m7] would hand back a 7 and
   * relabel the verse.
   */
  const after = line.slice(found.index + found[1].length);
  const number = /(?:^|[^A-Za-z#])(\d{1,2})(?![\d#])/.exec(after.replace(/\[[^\]]*\]/g, ' '));

  return {
    label: number ? `[${word} ${number[1]}]` : `[${word}]`,
    chords: chords.length ? chords.map((c) => `[${c}]`).join(' ') : null
  };
}

/**
 * Repair a whole song, or return null when nothing on it is broken.
 * `pairs` carries each before/after so a person can read the diff.
 */
export function fixContent(content) {
  const output = [];
  const pairs = [];

  for (const line of content.split('\n')) {
    const r = splitLine(line);
    if (!r) {
      output.push(line);
      continue;
    }

    // is the same label already sitting on the line above?
    let prev = output.length - 1;
    while (prev >= 0 && !output[prev].trim()) prev--;
    const same = prev >= 0 && output[prev].trim().toLowerCase() === r.label.toLowerCase();

    const rebuilt = [];
    if (!same) rebuilt.push(r.label);
    if (r.chords) rebuilt.push(r.chords);
    output.push(...rebuilt);
    pairs.push({ before: line.trim(), after: rebuilt });
  }

  if (!pairs.length) return null;
  return { content: output.join('\n'), pairs };
}

/*
 * AI-TRAP: everything below runs on import, so guard it. Without this, a test
 * that imports fixContent() also connects and sweeps the catalogue — and
 * inherits --write from whatever argv the importer happened to have.
 */
const runDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (!runDirectly) {
  // imported for its functions only
} else {
await connect();

const samples = [];
let linesFixed = 0;

const r = await sweep({
  model: Song,
  filter: { deletedAt: null },
  select: 'title arrangements.content',
  dry: !WRITE,
  change(song) {
    const before = song.arrangements?.[0]?.content || '';
    if (!before) return null;
    const res = fixContent(before);
    if (!res) return null;
    linesFixed += res.pairs.length;
    if (samples.length < SAMPLE) samples.push({ title: song.title, pairs: res.pairs });
    return { 'arrangements.0.content': res.content };
  }
});

console.log(`\n  broken songs: ${r.changed}, lines repaired: ${linesFixed}, ${r.ms}ms`);
console.log(`\n  === sample (${samples.length} songs) ===`);
for (const s of samples) {
  console.log(`\n  ${s.title}`);
  for (const pair of s.pairs) {
    console.log(`     before  ${JSON.stringify(pair.before.slice(0, 62))}`);
    for (const l of pair.after) console.log(`     after   ${JSON.stringify(l.slice(0, 62))}`);
  }
}

if (!WRITE) console.log('\n  (dry run — nothing was written; add --write)\n');
process.exit(0);

}
