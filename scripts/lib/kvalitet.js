/**
 * The house pattern, as testable rules. No database, no I/O — pass it lyrics,
 * get back what is wrong with them.
 *
 * Every rule here was measured against the real catalogue before it was
 * trusted, and six earlier drafts were thrown away for reporting healthy data
 * as broken. The AI-TRAP comments are not decoration: each one marks a rule
 * that looked obviously correct and was not.
 *
 * AI-DECISION: rules only ever DESCRIBE. Repair lives in tidyContent.js and
 * doctor.js. Keeping the two apart means a wrong rule produces a wrong report
 * instead of fourteen thousand wrong rows.
 */

/*
 * AI-TRAP: a section label and a chord share one syntax — [Strofa 2] and [Am]
 * are both brackets. Confuse them in one direction and every song looks
 * structured; confuse them in the other and every song looks chordless.
 */
const CHORD = /^[A-H][#b]?(?:m|maj|min|dim|aug|sus|add)?\d{0,2}(?:\/[A-H][#b]?)?$/;
export const isChord = (t) => CHORD.test(String(t).trim());

/** Section keywords, in both the house vocabulary and the imported English. */
const SEKCIJA = /^(strofa|refren|uvod|kraj|prelaz|solo|verse|chorus|bridge|intro|outro)\b/i;

/**
 * Labels with a chord driven through the middle of the word: [Strof[F]a 1].
 *
 * AI-TRAP: the existing kvar-u-oznaci pattern anchors on the keyword sitting
 * flush against the opening bracket, so it sees [Strofa [G]1] and misses
 * [Strof[F]a 1] and [Ver[Dsus4]se 1] — the chord split the keyword itself and
 * there is no longer a whole word to anchor on. Rebuild the label first, then
 * ask what it says.
 */
export function razbijeneOznake(content) {
  return [...content.matchAll(/\[([^\[\]\n]*\[[^\]\n]*\][^\[\]\n]*)\]/g)]
    .map((m) => m[1].replace(/\[[^\]]*\]/g, '').trim())
    .filter((t) => SEKCIJA.test(t));
}

/** Bracketed tokens that sit alone on a line and are not chords. */
export function labels(content) {
  return [...content.matchAll(/^[ \t]*\[([^\]]{2,24})\][ \t]*$/gm)]
    .map((m) => m[1].trim())
    .filter((t) => !isChord(t));
}

/** [label, body] pairs, so a section can be judged on its own. */
export function sections(content) {
  const out = [];
  let last = null;
  let at = 0;
  for (const m of content.matchAll(/^[ \t]*\[([^\]]{2,24})\][ \t]*$/gm)) {
    if (isChord(m[1].trim())) continue;
    if (last !== null) out.push([last, content.slice(at, m.index)]);
    last = m[1].trim();
    at = m.index + m[0].length;
  }
  if (last !== null) out.push([last, content.slice(at)]);
  return out;
}

export const RULES = [
  {
    id: 'prazna-pjesma',
    weight: 8,
    fix: 'ručno',
    why: 'naslov postoji, teksta nema — ostatak uvoznika',
    test: (c) => /nisu upisani|nije ažuriran|nije azuriran/i.test(c)
  },
  {
    id: 'kvar-u-oznaci',
    weight: 6,
    fix: 'skripta',
    why: 'red akorada slijepljen s oznakom: [Hm][Strofa [G]1]',
    /*
     * The wreck has a bracket INSIDE the label — [Strofa [G]1] — or a run of
     * closing brackets, [Strofa]]]]]]]]] [E] 1].
     *
     * AI-TRAP: an earlier version also flagged "a chord immediately before a
     * label" and counted 3,564 songs. 2,609 of those lines were
     * "[Prelaz / Solo]:" — a perfectly good label that simply carries a colon,
     * and not a chord in sight. Sampling the matches is what caught it; the
     * count alone looked like a discovery.
     */
    test: (c) =>
      /\[(strofa|refren|uvod|kraj|prelaz)[^\]\n]*\[/i.test(c) ||
      /\[(strofa|refren)\]{2,}/i.test(c) ||
      razbijeneOznake(c).length > 0
  },
  {
    id: 'sekcija-bez-akorda',
    weight: 5,
    fix: 'ručno',
    why: 'strofa ima tekst, nema nijedan akord',
    /*
     * AI-TRAP: look for a chord ANYWHERE in the block, never at line start.
     * This catalogue is inline ChordPro — "ja [Am]sam" — so a line-leading
     * test called 85% of the catalogue chordless when the truth is 9.6%.
     */
    test: (c) =>
      sections(c).some(([, body]) => {
        if (body.trim().length <= 40) return false;
        return ![...body.matchAll(/\[([^\]]{1,10})\]/g)].some((m) => isChord(m[1]));
      })
  },
  { id: 'kratak-tekst', weight: 5, fix: 'ručno', why: 'ispod 200 znakova', test: (c) => c.trim().length < 200 },
  {
    id: 'bez-sekcija',
    weight: 4,
    fix: 'ručno',
    why: 'nema nijednu oznaku strofe ili refrena',
    test: (c) => labels(c).length === 0
  },
  {
    id: 'potpis',
    weight: 3,
    fix: 'skripta',
    why: 'potpis transkribenta u tekstu — pripada polju, ne tekstu',
    /*
     * AI-TRAP: never match "izvor" or "preuzeto". Izvor is an ordinary Bosnian
     * word — spring, source — and it sings: "kad na izvor ja pođem", "more je
     * izvor života". With it in the pattern this rule claimed 622 songs and
     * most of the samples were lyrics. "by" alone is no better: there is a
     * song called "By pass".
     */
    test: (c) =>
      /\b(akordi|tabovi?|tekst)\s+by\s+[A-ZČĆŠĐŽ]/i.test(c) ||
      /\b(transkripcij|obradio|priredio)/i.test(c) ||
      /\b(tekst|muzika|autor|aranžman|aranzman)\s*:/i.test(c) ||
      /(https?:\/\/|www\.)/i.test(c)
  },
  {
    id: 'nema-refren',
    weight: 2,
    fix: 'ručno',
    why: 'ima strofe, nema označen refren',
    test: (c) => {
      const l = labels(c);
      return l.length > 0 && !l.some((x) => /^(refren|chorus)/i.test(x));
    }
  },
  {
    id: 'engleske-oznake',
    weight: 2,
    fix: 'skripta',
    why: '[Chorus]/[Verse] umjesto [Refren]/[Strofa]',
    test: (c) => labels(c).some((l) => /^(chorus|verse|bridge|intro|outro)\b/i.test(l))
  },
  {
    id: 'capo-u-tekstu',
    weight: 2,
    fix: 'skripta',
    why: 'capo je podatak — seli se u polje, ne briše se',
    /*
     * AI-TRAP: anchor on whole words. /capo|kapo/ also matches "kapom",
     * "kapone" and every declension of the noun kapa — it reported 52 songs
     * when 40 was the truth, and half the samples were prose.
     */
    test: (c) => /\b(capo|kapodaster)\b|\bcapo\s*\d|\d\.?\s*prag\b/i.test(c)
  },
  {
    id: 'dupli-razmak',
    weight: 1,
    fix: 'skripta',
    why: 'dva razmaka usred rečenice',
    /*
     * AI-TRAP: chord-only lines need their spacing — [Am]   [F] places the
     * change over a syllable. Prose lines only.
     */
    test: (c) =>
      c.split('\n').some((l) => !/^[\s\[\]A-Hb#minajsudg0-9/]*$/.test(l) && /\S {2,}\S/.test(l))
  },
  { id: 'crtice', weight: 1, fix: 'skripta', why: 'niz crtica u tekstu', test: (c) => /-{2,}/.test(c) },
  {
    id: 'razmak-prije-znaka',
    weight: 1,
    fix: 'skripta',
    why: 'razmak prije zareza ili tačke',
    /*
     * AI-TRAP: [ \t], never \s. \s includes the newline, and a line that ends
     * where the next one opens with punctuation is ordinary in lyrics. With
     * \s+ this rule reported 896 songs after the repair had already run — 1100
     * of those hits were line breaks and exactly one was a real space.
     */
    test: (c) => /[ \t]+[,.!?;:]/.test(c)
  },
  {
    id: 'pojedena-zagrada',
    weight: 6,
    fix: 'skripta',
    why: 'akord bez otvarajuće zagrade: [Am]D] je bilo [Am][D]',
    /*
     * AI-TRAP: repair only when what is left parses AS a chord. Measured over
     * the catalogue: 1,956 sites in 1,182 songs, 1,778 of the leftovers are
     * chords. The remaining 178 swallowed a letter of the lyric along with the
     * bracket — "]jG]", "]m]", "]s]" — and nothing in the text says where the
     * word ended and the chord began. Those are for a person, not a pass.
     */
    test: (c) => [...c.matchAll(/\]([^\[\]\s]{1,12})\]/g)].some((m) => isChord(m[1]))
  },
  {
    id: 'spljostena-tabulatura',
    weight: 6,
    fix: 'ručno',
    why: 'tabulatura svedena na prazne taktove — vraća se iz backupa',
    /*
     * AI-NOTE: this is damage tidyContent did before it learned to skip tab
     * rows (see isTabLine there), not something an importer left behind. The
     * dashes carried the timing and they are gone, so the row cannot be
     * rebuilt from itself. Restore these from the 2026-08-30 backup; do not
     * let anything rewrite them.
     */
    test: (c) =>
      c
        .split('\n')
        .some((l) => /^[\s|.]+$/.test(l) && (l.match(/\|/g) || []).length >= 3)
  },
  {
    id: 'mojibake',
    weight: 3,
    fix: 'ručno',
    why: 'UTF-8 pročitan kao Latin-1: Å¡ umjesto š',
    /*
     * AI-DECISION: reported, never repaired in bulk. It is 13 songs, and a
     * mapping table applied to the wrong encoding lays a second layer of
     * damage over the first. A person fixes thirteen songs sooner than anyone
     * verifies the table.
     */
    test: (c) => /Ä‡|Å¡|Ä‘|Å¾|â€|ï¿½|Ã…|Ã„/.test(c)
  },
  {
    id: 'email-u-tekstu',
    weight: 3,
    fix: 'skripta',
    why: 'tuđa e-mail adresa u tekstu — potpis, ne stih',
    test: (c) => /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(c)
  },
  {
    id: 'ponovljena-sekcija',
    weight: 1,
    fix: 'ručno',
    why: 'dva puta ista numerisana strofa',
    /*
     * AI-TRAP: only NUMBERED labels count. A repeated [Refren] is the chorus
     * doing its job — an earlier draft flagged 3,717 correctly built songs.
     */
    test: (c) => {
      const n = labels(c)
        .map((x) => x.toLowerCase())
        .filter((x) => /\d/.test(x));
      return new Set(n).size !== n.length;
    }
  }
];

/** Score one song's lyrics: 100 is spotless. */
export function judge(content) {
  const flags = RULES.filter((r) => {
    try {
      return r.test(content);
    } catch {
      return false;
    }
  });
  return {
    score: Math.max(0, 100 - flags.reduce((n, f) => n + f.weight, 0) * 4),
    flags: flags.map((f) => f.id)
  };
}
