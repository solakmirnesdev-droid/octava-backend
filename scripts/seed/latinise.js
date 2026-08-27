/**
 * Puts discovered artists into Latin script and removes the duplicates that
 * Cyrillic caused.
 *
 * MusicBrainz stores Macedonian and Russian artists in Cyrillic, so
 * "Тоше Проески" arrived as a brand new artist even though "Toše Proeski" was
 * already in the catalogue — the duplicate check compares names, and those two
 * never match.
 *
 * AI-NOTE: this used to carry a hand-written table of six names. It now uses the
 * shared transliterator, which covers every name rather than the ones somebody
 * remembered, and leaves no Cyrillic in this file for the next import to copy.
 * The same conversion runs in the Song and Artist schemas, so the catalogue
 * cannot take Cyrillic even if this script is skipped.
 */
import fs from 'node:fs/promises';
import { toLatin, hasCyrillic } from '../../src/utils/latinise.js';

const dir = new URL('./', import.meta.url);
const artists = JSON.parse(await fs.readFile(new URL('discovered.json', dir), 'utf8'));
const titles = JSON.parse(await fs.readFile(new URL('titles.json', dir), 'utf8'));

const existing = new Set(Object.keys(titles.result).map((k) => k.toLowerCase()));

const out = [];
let renamed = 0;
let deduped = 0;

for (const a of artists) {
  if (hasCyrillic(a.name)) {
    a.cyrillic = a.name;
    a.name = toLatin(a.name);
    renamed++;
  }

  if (existing.has(a.name.toLowerCase())) {
    console.log(`  duplikat: ${a.name}${a.cyrillic ? ' (bio ' + a.cyrillic + ')' : ''} — vec u katalogu`);
    deduped++;
    continue;
  }
  out.push(a);
}

await fs.writeFile(new URL('discovered.json', dir), JSON.stringify(out, null, 2));
console.log(`\n  preimenovano u latinicu: ${renamed}   uklonjeno duplikata: ${deduped}   ostaje: ${out.length}`);
