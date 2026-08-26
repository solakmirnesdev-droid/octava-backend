/**
 * Puts Macedonian artists into Latin script and removes the duplicates that
 * caused.
 *
 * MusicBrainz stores Macedonian artists in Cyrillic, so "Тоше Проески" arrived
 * as a brand new artist even though "Toše Proeski" was already in the
 * catalogue — the duplicate check compares names and those two never match.
 * The site is written in Latin script; the catalogue should be too.
 */
import fs from 'node:fs/promises';

/** Written out rather than transliterated: a table cannot get a name wrong. */
const LATIN = {
  'Тоше Проески': 'Toše Proeski',
  'Калиопи': 'Kaliopi',
  'Каролина Гочева': 'Karolina Gočeva',
  'Баклава': 'Baklava',
  'Ареа': 'Area',
  'Кочани Оркестар': 'Kočani Orkestar'
};

const dir = new URL('./', import.meta.url);
const artists = JSON.parse(await fs.readFile(new URL('discovered.json', dir), 'utf8'));
const titles = JSON.parse(await fs.readFile(new URL('titles.json', dir), 'utf8'));

const existing = new Set(Object.keys(titles.result).map((k) => k.toLowerCase()));

const out = [];
let renamed = 0;
let deduped = 0;

for (const a of artists) {
  const latin = LATIN[a.name];
  if (latin) { a.cyrillic = a.name; a.name = latin; renamed++; }

  if (existing.has(a.name.toLowerCase())) {
    console.log(`  duplikat: ${a.name}${a.cyrillic ? ' (bio ' + a.cyrillic + ')' : ''} — vec u katalogu`);
    deduped++;
    continue;
  }
  out.push(a);
}

await fs.writeFile(new URL('discovered.json', dir), JSON.stringify(out, null, 2));
console.log(`\n  preimenovano u latinicu: ${renamed}   uklonjeno duplikata: ${deduped}   ostaje: ${out.length}`);
