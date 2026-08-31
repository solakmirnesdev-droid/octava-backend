/**
 * OCTAVA MASTER SONG SANITIZER & WORKER QUALITY PIPELINE
 * Incorporates all real-world edge-case fixes discovered from live user testing.
 */

export function sanitizeSongTitle(title) {
  if (!title) return '';
  return title
    .replace(/\s*(?:1|2|3|v1|v2|v3)\s*$/i, '') // Strip trailing version numbers (e.g. "Ana ne budi luda1")
    .replace(/\s*\([^)]*capo[^)]*\)/gi, '')    // Strip (Capo 2) from titles
    .replace(/\s*\([^)]*(?:akordi|tekst|chords|tab)[^)]*\)/gi, '')
    .trim();
}

export function sanitizeSongContent(content, meta = {}) {
  if (!content) return '';

  let cleaned = content;

  // 1. Extract Capo if mentioned in text like "(Capo 2)" or "Capo: 2"
  const capoMatch = cleaned.match(/\(?(?:capo|kapodaster)\s*:?\s*(\d+)\)?/i);
  if (capoMatch && meta && !meta.capo) {
    meta.capo = parseInt(capoMatch[1], 10);
  }

  cleaned = cleaned
    // 2. Strip scraper dates (e.g. 29.07.2016.)
    .replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\.?\b/g, '')
    // 3. Strip forum comments and residue
    .replace(/\(?(?:capo|kapodaster)\s*:?\s*\d+\)?/gi, '')
    .replace(/(?:znam\s+)?drugi\s+deo:?/gi, '')
    .replace(/akorde?\s+(?:pisao|skinuo|poslao)[^:\n]*:?/gi, '')
    .replace(/\(samo\s+bass\)/gi, '')
    // 4. Strip long hyphen runs (e.g. D-----C#7----F#m or F#m--E--Ab)
    .replace(/([A-G][#b]?m?(?:maj|dim|aug|sus\d?|add\d?|\d)?)-{2,}/g, '[$1] ')
    .replace(/-{3,}/g, ' ')
    // 5. Fix fractured words and glued brackets (e.g. "j Am]a" -> "ja [Am]", "godinaG]ma" -> "[G]godinama")
    .replace(/([a-zA-ZčćžšđČĆŽŠĐ]+)\s*([A-G][b#]?(?:m|maj|dim|aug|sus\d?|add\d?|\d)?)]\s*([a-zA-ZčćžšđČĆŽŠĐ]*)/g, '[$2]$1$3')
    .replace(/([a-zA-ZčćžšđČĆŽŠĐ]+)\[([A-G][^\]]*)\]/g, '[$2]$1')
    // 6. Fix bracket collisions (e.g. "]]" -> "]", "[[" -> "[")
    .replace(/\]\]+/g, ']')
    .replace(/\[\[+/g, '[')
    // 7. Fix section headers with trailing colons (e.g. "[Strofa 1]:" -> "[Strofa 1]")
    .replace(/^\[([^\]]+)\]:\s*$/gm, '[$1]')
    // 8. Fix section headers with embedded chords (e.g. "[Strofa [D]1]" -> "[Strofa 1]")
    .replace(/\[Strofa\s*\[[A-G][^\]]*\]\s*(\d+)\]/gi, '[Strofa $1]')
    .replace(/\[Refren\s*\[[A-G][^\]]*\]\]/gi, '[Refren]')
    // 9. Fix encoding glitches and HTML entities
    .replace(/Â/g, '')
    .replace(/&#194;/g, '')
    .replace(/~i/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\[([A-G][^\]]*)[˙~]\]/g, '[$1]')
    // 10. Fix spaced brackets (e.g. "[Am] " at start of syllables)
    .replace(/\[([A-G][^\]]*)\s+\]/g, '[$1]')
    .trim();

  // 11. STRICT NO DOUBLE SPACES RULE: Ensure maximum 1 space anywhere on any line
  const normalizedLines = cleaned.split('\n').map(line => {
    return line.replace(/[ \t]{2,}/g, ' ').trimEnd();
  });

  return normalizedLines.join('\n').trim();
}

export function detectCorruptChordClump(line) {
  // Detects lines like "HmHmHmHmF#mF#mGGAA" where chords are clumped without spaces or lyrics
  const chordClumpRegex = /(?:[A-G][#b]?m?){4,}/;
  return chordClumpRegex.test(line.replace(/\s+/g, ''));
}
