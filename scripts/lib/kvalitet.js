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
    test: (c) => /\[[A-H][#b]?m?\]\s*\[?\s*(strofa|refren)|\[(strofa|refren)[^\]]*\[/i.test(c)
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
    why: 'potpis ili izvor u tekstu — pripada polju, ne tekstu',
    test: (c) =>
      /\bby\s+[A-ZČĆŠĐŽ]/.test(c) ||
      /\b(tekst|muzika|autor|aranžman|aranzman)\s*:/i.test(c) ||
      /\b(obradio|priredio|transkri|preuzeto|izvor)/i.test(c) ||
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
    test: (c) => /\s+[,.!?;:]/.test(c)
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
