/**
 * Retries only the artists the main import lost, and merges them in.
 *
 * A full re-run would spend four minutes re-fetching what already worked, and
 * every extra request is another chance to be throttled.
 */
import fs from 'node:fs/promises';
import { titlesFor } from './musicbrainz.js';

const path = new URL('./titles.json', import.meta.url);
const data = JSON.parse(await fs.readFile(path, 'utf8'));

const names = data.missing.map((m) => m.split(' (')[0]);
console.log(`  ponavljam za ${names.length} izvodjaca`);

const stillMissing = [];
let added = 0;

for (const [i, name] of names.entries()) {
  try {
    const { artist, titles } = await titlesFor(name, { want: 12 });
    if (artist && titles.length) {
      data.result[name] = { mbid: artist.id, matched: artist.name, country: artist.country, titles };
      added++;
      console.log(`  [${i + 1}/${names.length}] ${name} → ${titles.length} (${artist.country})`);
    } else {
      stillMissing.push(name);
      console.log(`  [${i + 1}/${names.length}] ${name} → nema u regiji`);
    }
  } catch (err) {
    stillMissing.push(`${name} (${err.message})`);
    console.log(`  [${i + 1}/${names.length}] ${name} → GRESKA`);
  }
}

data.missing = stillMissing;
await fs.writeFile(path, JSON.stringify(data, null, 2));
console.log(`\n  dodano: ${added}  jos nedostaje: ${stillMissing.length}`);
