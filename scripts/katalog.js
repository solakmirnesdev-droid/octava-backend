#!/usr/bin/env node
/**
 * The one command for catalogue work. Every other script in scripts/ is an
 * implementation detail; an agent should reach for this and nothing else.
 *
 *   npm run katalog                        report, changes nothing
 *   npm run katalog:popravi                mechanical repairs, dry
 *   npm run katalog:popravi -- --write     apply them
 *   npm run katalog:ocjeni  -- --write     store a score on every song
 *   npm run katalog:provjeri               every script path still resolves
 *
 * AI-TRAP: `npm run katalog popravi` does NOT pass the word through — npm
 * needs `--` before arguments. That is why each command has its own npm entry
 * instead of one that takes a subcommand. Direct form works as expected:
 * `node scripts/katalog.js popravi --write`.
 *
 * AI-DECISION: one entry point exists because 108 scripts is not a toolbox, it
 * is a minefield — 31 of them are called by nobody and two used to drop whole
 * collections. An agent picking a filename out of that directory will
 * eventually pick a bad one. This file is the supported surface; see
 * AGENTS.md, "Rad s katalogom".
 *
 * AI-NOTE: every command is DRY BY DEFAULT and prints what it would change.
 * Nothing here writes without --write. That is the whole safety model, so do
 * not add a command that breaks it.
 */
import 'dotenv/config';
import Song from '../src/models/Song.js';
import Artist from '../src/models/Artist.js';
import { connect, sweep } from './lib/sweep.js';
import { RULES, judge, isChord } from './lib/kvalitet.js';
import { citajRadnika, mojaDionica } from './lib/dionica.js';
import { tidyContent } from '../src/utils/tidyContent.js';

// The command is the first bare word; everything starting with - is a flag.
const naredba = process.argv.slice(2).find((a) => !a.startsWith('-')) || 'stanje';
const WRITE = process.argv.includes('--write');
const LIMIT = Number(argOf('--limit') || 20);
const RADNIK = citajRadnika();

/** Every command works on one lane, or the whole catalogue when none is given. */
async function opseg() {
  const f = await mojaDionica(Song, { deletedAt: null }, RADNIK);
  if (RADNIK) console.log(`\n  radnik ${RADNIK.i}/${RADNIK.n} — svoja dionica, bez preklapanja`);
  return f;
}

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

/* ------------------------------------------------------------------ stanje */

async function stanje() {
  const tally = new Map();
  const primjeri = new Map();
  let ocijenjeno = 0;
  let cisto = 0;

  const r = await sweep({
    model: Song,
    filter: await opseg(),
    select: 'title arrangements.content',
    dry: true,
    change(song) {
      const c = song.arrangements?.[0]?.content || '';
      if (!c) return null;
      ocijenjeno++;
      const { flags } = judge(c);
      if (!flags.length) cisto++;
      for (const f of flags) {
        tally.set(f, (tally.get(f) || 0) + 1);
        if (!primjeri.has(f)) primjeri.set(f, []);
        if (primjeri.get(f).length < LIMIT) primjeri.get(f).push(song);
      }
      return null;
    }
  });

  console.log(`\n  KATALOG — ${ocijenjeno} pjesama, ${r.ms}ms`);
  console.log(`  besprijekornih: ${cisto} (${((cisto / ocijenjeno) * 100).toFixed(1)}%)\n`);
  console.log(`  ${pad('nalaz', 22)}${num('broj', 6)}${num('udio', 8)}   popravlja`);
  console.log('  ' + '─'.repeat(56));

  for (const rule of [...RULES].sort((a, b) => (tally.get(b.id) || 0) - (tally.get(a.id) || 0))) {
    const n = tally.get(rule.id) || 0;
    if (!n) continue;
    console.log(
      `  ${pad(rule.id, 22)}${num(n, 6)}${num(((n / ocijenjeno) * 100).toFixed(1) + '%', 8)}   ${rule.fix}`
    );
  }

  const skripta = RULES.filter((x) => x.fix === 'skripta' && tally.get(x.id)).reduce(
    (n, x) => n + tally.get(x.id),
    0
  );
  console.log('  ' + '─'.repeat(56));
  console.log(`  skripta može odmah: ${skripta} prijava   →  npm run katalog popravi\n`);

  await izvodjaci();
}

/** Artist-side findings. Small numbers, every one needs a human — so list them. */
async function izvodjaci() {
  const svi = await Artist.find().select('name songCount').lean();
  const PREZIME = /(ić|ović|ević|ski)$/i;

  const obrnuti = svi.filter((a) => {
    const t = a.name.trim().split(/\s+/);
    return t.length === 2 && PREZIME.test(t[0]) && !PREZIME.test(t[1]);
  });
  const scifrom = svi.filter((a) => /\s\d+$/.test(a.name));
  const razmaci = svi.filter((a) => /\s{2,}/.test(a.name) || a.name !== a.name.trim());

  console.log(`  IZVOĐAČI — ${svi.length}`);
  console.log(`     mogući obrnut red (provjeri ručno) : ${obrnuti.length}`);
  for (const a of obrnuti.slice(0, LIMIT)) console.log(`        ${a.name}`);
  console.log(`     ime završava cifrom                : ${scifrom.length}`);
  for (const a of scifrom.slice(0, LIMIT)) console.log(`        ${a.name}`);
  console.log(`     višak razmaka                      : ${razmaci.length}\n`);

  /*
   * AI-TRAP: do not "fix" these automatically. The reversed-name heuristic
   * flags 27 artists and only 2 are genuinely reversed — the rest are bands
   * (Kraljevski Apartman, Beogradski Sindikat) and, memorably, Eric Clapton.
   * Splitting "X i Y" is worse still: it would shred 211 band names such as
   * Bajaga i Instruktori and Leb i Sol. There are ZERO real feat.
   * collaborations in this catalogue. This list is for a person to read.
   */
  console.log('  (ovo su prijedlozi za pregled — ne popravljaju se automatski)\n');
}

/* ------------------------------------------------------------------ ocjeni */

async function ocjeni() {
  const r = await sweep({
    model: Song,
    filter: await opseg(),
    select: 'arrangements.content quality',
    dry: !WRITE,
    change(song) {
      const c = song.arrangements?.[0]?.content || '';
      if (!c) return null;
      const { score, flags } = judge(c);
      if (song.quality?.score === score) return null;
      return { quality: { score, flags, checkedAt: new Date() } };
    }
  });
  console.log(`\n  ocijenjeno ${r.seen}, za upis ${r.changed}, ${r.ms}ms`);
  if (!WRITE) console.log('  (probni prolaz — dodaj --write)\n');
}

/* ----------------------------------------------------------------- popravi */

const OZNAKE_EN = [
  [/^chorus\b/i, 'Refren'],
  [/^verse\b/i, 'Strofa'],
  [/^bridge\b/i, 'Prelaz'],
  [/^intro\b/i, 'Uvod'],
  [/^outro\b/i, 'Kraj']
];

/** Rewrite an English section label into the house vocabulary, keeping its number. */
function prevediOznaku(label) {
  for (const [re, our] of OZNAKE_EN) {
    if (re.test(label)) {
      const broj = label.match(/\d+/);
      return broj ? `${our} ${broj[0]}` : our;
    }
  }
  return null;
}

/** A line that is a transcription credit and nothing else. */
const POTPIS =
  /\b(akordi|tabovi?|tekst)\s+by\s+[A-ZČĆŠĐŽ]|\b(transkripcij|obradio|priredio)|\b(tekst|muzika|glazba|autor|aranžman|aranzman)\s*:|(https?:\/\/|www\.)|[\w.+-]+@[\w-]+\.[a-z]{2,}/i;

async function popravi() {
  let bezRazmaka = 0;
  let prevedeno = 0;
  let potpisa = 0;
  let zagrada = 0;

  const r = await sweep({
    model: Song,
    filter: await opseg(),
    select: 'arrangements.content',
    dry: !WRITE,
    change(song) {
      const prije = song.arrangements?.[0]?.content || '';
      if (!prije) return null;

      // 1. whitespace, dashes, space-before-punctuation — chord lines untouched
      let poslije = tidyContent(prije);
      if (poslije !== prije) bezRazmaka++;

      // 2. English section labels -> ours
      poslije = poslije.replace(/^([ \t]*)\[([^\]]{2,24})\]([ \t]*)$/gm, (whole, a, label, b) => {
        const nova = prevediOznaku(label.trim());
        if (!nova) return whole;
        prevedeno++;
        return `${a}[${nova}]${b}`;
      });

      // 3. transcription credits — they belong in a field, not in the lyrics
      const bezPotpisa = poslije
        .split('\n')
        .filter((red) => {
          if (!POTPIS.test(red)) return true;
          /*
           * AI-TRAP: strip the chords before judging the line, and keep any
           * line longer than nine words. 449 of these credits have chords
           * injected into them, and a handful are a credit tacked onto a real
           * lyric line — dropping those would take the lyric with it.
           */
          const golo = red.replace(/\[[^\]]*\]/g, '').trim();
          if (golo.split(/\s+/).length > 9) return true;
          potpisa++;
          return false;
        })
        .join('\n');
      poslije = bezPotpisa;

      /*
       * 4. a chord that lost its opening bracket — [Am]D] was [Am][D].
       *
       * AI-TRAP: only when the leftover parses as a chord. 178 of the 1,956
       * sites took a letter of the lyric with the bracket ("]jG]", "]m]") and
       * restoring those would invent a chord where a word ended. Leave them.
       */
      poslije = poslije.replace(/\]([^\[\]\s]{1,12})\]/g, (whole, t) => {
        if (!isChord(t)) return whole;
        zagrada++;
        return `][${t}]`;
      });

      if (poslije === prije) return null;
      return { 'arrangements.0.content': poslije };
    }
  });

  console.log(`\n  pregledano ${r.seen}, za izmjenu ${r.changed}, ${r.ms}ms`);
  console.log(`     razmaci/crtice/interpunkcija : ${bezRazmaka}`);
  console.log(`     prevedene oznake             : ${prevedeno}`);
  console.log(`     uklonjeni potpisi            : ${potpisa}`);
  console.log(`     vraćene zagrade akorada      : ${zagrada}`);

  /*
   * AI-NOTE: kvar-u-oznaci (3,523 songs) is deliberately NOT repaired here.
   * The wreck looks like [Hm][Strofa [G]1] [D] [A] — a chord row fused with a
   * label. Unpicking it means deciding which chords belong over which
   * syllable, and a wrong guess silently moves chords in a quarter of the
   * catalogue. It needs its own script and its own verification pass.
   */
  console.log(`\n  (kvar-u-oznaci se NE popravlja ovdje — traži zasebnu, provjerenu skriptu)`);
  if (!WRITE) console.log('  (probni prolaz — dodaj --write)\n');
}

/* ---------------------------------------------------------------- provjeri */

async function provjeri() {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', ['scripts/verify/imports.js'], { encoding: 'utf8' });
  console.log(r.stdout || r.stderr);
}

/* -------------------------------------------------------------------- main */

const NAREDBE = { stanje, ocjeni, popravi, provjeri };

if (!NAREDBE[naredba]) {
  console.error(`\n  nepoznata naredba: ${naredba}`);
  console.error(`  dostupno: ${Object.keys(NAREDBE).join(', ')}\n`);
  process.exit(1);
}

if (naredba !== 'provjeri') await connect();
await NAREDBE[naredba]();
process.exit(0);
