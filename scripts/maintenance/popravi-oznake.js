/**
 * Unpicks chord rows that got fused with a section label.
 *
 *   node scripts/maintenance/popravi-oznake.js            # uzorak, ništa se ne piše
 *   node scripts/maintenance/popravi-oznake.js --uzorak 30
 *   node scripts/maintenance/popravi-oznake.js --write
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
 * AI-DECISION: this lives apart from `katalog.js popravi` and stays dry until
 * asked, because it is the one repair that can silently move chords. It was
 * written only after sampling the matches: the rule that first found this
 * counted 3,564 songs, and 2,609 of those were "[Prelaz / Solo]:" — a healthy
 * label with a colon. The real number is 600. See KATALOG.md §5.
 */
import 'dotenv/config';
import Song from '../../src/models/Song.js';
import '../../src/models/Artist.js';
import { connect, sweep } from '../lib/sweep.js';

const WRITE = process.argv.includes('--write');
const UZORAK = Number(argOf('--uzorak') || 12);

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

const OZNAKA = /\[(strofa|refren|uvod|kraj|prelaz)[^\]\n]*\[|\[(strofa|refren)\]{2,}/i;
const AKORD = /^[A-H][#b]?(?:m|maj|min|dim|aug|sus|add)?\d{0,2}(?:\/[A-H][#b]?)?$/;

/**
 * Rebuild one broken line into { oznaka, akordi }.
 * Returns null when the line is not actually broken.
 */
function razdvoji(red) {
  if (!OZNAKA.test(red)) return null;

  // every bracketed token on the line, in the order it appears
  const tokeni = [...red.matchAll(/\[([^\[\]]*)\]/g)].map((m) => m[1].trim());
  const akordi = tokeni.filter((t) => AKORD.test(t));

  /*
   * The label survives as plain text once its brackets are broken, so read the
   * word and its number straight off the line rather than out of the tokens.
   */
  const ime = /(strofa|refren|uvod|kraj|prelaz)/i.exec(red);
  if (!ime) return null;
  const rijec = ime[1][0].toUpperCase() + ime[1].slice(1).toLowerCase();

  /*
   * AI-TRAP: take the number from AFTER the label word, never the first digit
   * on the line. Chords carry digits too — [C#m7] would hand back a 7 and
   * relabel the verse.
   */
  const poslije = red.slice(ime.index + ime[1].length);
  const broj = /(?:^|[^A-Za-z#])(\d{1,2})(?![\d#])/.exec(poslije.replace(/\[[^\]]*\]/g, ' '));

  return {
    oznaka: broj ? `[${rijec} ${broj[1]}]` : `[${rijec}]`,
    akordi: akordi.length ? akordi.map((a) => `[${a}]`).join(' ') : null
  };
}

/**
 * Repair a whole song, or return null when nothing on it is broken.
 * `parovi` carries each before/after so a person can read the diff.
 */
export function popraviSadrzaj(sadrzaj) {
  const izlaz = [];
  const parovi = [];

  for (const red of sadrzaj.split('\n')) {
    const r = razdvoji(red);
    if (!r) {
      izlaz.push(red);
      continue;
    }

    // is the same label already sitting on the line above?
    let prethodna = izlaz.length - 1;
    while (prethodna >= 0 && !izlaz[prethodna].trim()) prethodna--;
    const isti = prethodna >= 0 && izlaz[prethodna].trim().toLowerCase() === r.oznaka.toLowerCase();

    const nove = [];
    if (!isti) nove.push(r.oznaka);
    if (r.akordi) nove.push(r.akordi);
    izlaz.push(...nove);
    parovi.push({ prije: red.trim(), poslije: nove });
  }

  if (!parovi.length) return null;
  return { sadrzaj: izlaz.join('\n'), parovi };
}

/*
 * AI-TRAP: everything below runs on import, so guard it. Without this, a test
 * that imports popraviSadrzaj() also connects and sweeps the catalogue — and
 * inherits --write from whatever argv the importer happened to have.
 */
const pokrenutoDirektno = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (!pokrenutoDirektno) {
  // imported for its functions only
} else {
await connect();

const uzorci = [];
let redovaPopravljeno = 0;

const r = await sweep({
  model: Song,
  filter: { deletedAt: null },
  select: 'title arrangements.content',
  dry: !WRITE,
  change(song) {
    const prije = song.arrangements?.[0]?.content || '';
    if (!prije) return null;
    const rez = popraviSadrzaj(prije);
    if (!rez) return null;
    redovaPopravljeno += rez.parovi.length;
    if (uzorci.length < UZORAK) uzorci.push({ naslov: song.title, parovi: rez.parovi });
    return { 'arrangements.0.content': rez.sadrzaj };
  }
});

console.log(`\n  pjesama s kvarom: ${r.changed}, popravljenih redova: ${redovaPopravljeno}, ${r.ms}ms`);
console.log(`\n  === uzorak (${uzorci.length} pjesama) ===`);
for (const u of uzorci) {
  console.log(`\n  ${u.naslov}`);
  for (const par of u.parovi) {
    console.log(`     prije    ${JSON.stringify(par.prije.slice(0, 62))}`);
    for (const l of par.poslije) console.log(`     poslije  ${JSON.stringify(l.slice(0, 62))}`);
  }
}

if (!WRITE) console.log('\n  (probni prolaz — ništa nije upisano; dodaj --write)\n');
process.exit(0);

}
