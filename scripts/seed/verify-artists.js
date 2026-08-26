/**
 * Checks each matched MusicBrainz artist against its country of origin.
 *
 * The name search happily returns a same-named artist from anywhere — "Regina"
 * came back as a Brazilian singer and "Boa" as a Korean one. Country is the
 * signal that separates them, and it was not saved on the first pass.
 */
import fs from 'node:fs/promises';

const UA = 'Octava/0.1 ( solakmirnes.dev@gmail.com )';
const BALKAN = new Set(['YU', 'BA', 'HR', 'RS', 'ME', 'MK', 'SI', 'XK']);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const path = new URL('./titles.json', import.meta.url);
const data = JSON.parse(await fs.readFile(path, 'utf8'));

const verdicts = [];
const entries = Object.entries(data.result);

for (const [i, [name, entry]] of entries.entries()) {
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist/${entry.mbid}?fmt=json`,
      { headers: { 'User-Agent': UA } });
    const a = res.ok ? await res.json() : null;
    const country = a?.country || a?.area?.name || null;
    entry.country = country;
    // Area name covers artists tagged by region rather than country code.
    const ok = country
      ? BALKAN.has(country) || /bosnia|herzegovina|croatia|serbia|yugoslav|montenegro|macedon|sloven|kosovo/i.test(country)
      : null;
    entry.balkan = ok;
    if (ok === false) verdicts.push([name, entry.matched, country]);
  } catch {
    entry.balkan = null;
  }
  if (i % 20 === 0) console.log(`  ${i + 1}/${entries.length}`);
  await pause(1100);
}

await fs.writeFile(path, JSON.stringify(data, null, 2));
console.log(`\n  van regije: ${verdicts.length}`);
for (const [n, m, c] of verdicts) console.log(`    ${n}  →  ${m}  (${c})`);
