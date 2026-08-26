/**
 * Pulls titles for the newly curated artists and merges them into titles.json.
 *
 * Their ids came out of discovery, so this is one request each instead of the
 * search-then-fetch pair the original import needed.
 */
import fs from 'node:fs/promises';

const UA = 'Octava/0.1 ( solakmirnes.dev@gmail.com )';
const WANT = 12;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACK_NUMBER = /^\s*\d{1,2}\s*[.)-]\s*/;
const BRACKETED = /\s*[([][^)\]]*[)\]]\s*/g;
const tidy = (raw) => String(raw || '')
  .replace(TRACK_NUMBER, '').replace(BRACKETED, ' ')
  .replace(/\s+/g, ' ').trim().replace(/[,;]+$/, '');

const dir = new URL('./', import.meta.url);
const artists = JSON.parse(await fs.readFile(new URL('discovered.json', dir), 'utf8'));
const data = JSON.parse(await fs.readFile(new URL('titles.json', dir), 'utf8'));

let added = 0;
const failed = [];

for (const [i, a] of artists.entries()) {
  let recs = [];
  try {
    for (const wait of [1000, 4000, 12000]) {
      const res = await fetch(`https://musicbrainz.org/ws/2/recording?artist=${a.mbid}&fmt=json&limit=100`,
        { headers: { 'User-Agent': UA } });
      if (res.ok) { recs = (await res.json()).recordings || []; break; }
      await pause(wait);
    }
  } catch { /* falls through to the empty check */ }

  if (!recs.length) { failed.push(a.name); console.log(`  [${i + 1}/${artists.length}] ${a.name} → 0`); await pause(1100); continue; }

  const counts = new Map();
  const everLower = new Set();
  for (const rec of recs) {
    const t = tidy(rec.title);
    for (const w of t.split(/\s+/)) {
      if (/^[a-zčćžšđ]/.test(w)) everLower.add(w.toLowerCase().replace(/[^\wčćžšđ']/g, ''));
    }
    if (t.length < 3 || t.length > 70 || t.includes('/')) continue;
    const key = t.toLowerCase();
    const e = counts.get(key) || { n: 0, forms: new Map() };
    e.n += 1;
    e.forms.set(t, (e.forms.get(t) || 0) + 1);
    counts.set(key, e);
  }

  const titles = [...counts.values()].sort((x, y) => y.n - x.n).slice(0, WANT)
    .map((e) => [...e.forms.entries()].sort((x, y) => y[1] - x[1])[0][0]);

  if (titles.length) {
    data.result[a.name] = { mbid: a.mbid, matched: a.cyrillic || a.name, country: a.country, titles };
    added++;
  } else failed.push(a.name);

  console.log(`  [${i + 1}/${artists.length}] ${a.name} → ${titles.length}`);
  await pause(1100);
}

await fs.writeFile(new URL('titles.json', dir), JSON.stringify(data, null, 2));
const total = Object.values(data.result).reduce((s, v) => s + v.titles.length, 0);
console.log(`\n  dodano izvodjaca: ${added}   bez naslova: ${failed.length}`);
console.log(`  ukupno sada: ${Object.keys(data.result).length} izvodjaca, ${total} naslova`);
