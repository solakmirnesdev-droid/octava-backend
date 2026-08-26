/**
 * Pulls more titles for artists we already matched.
 *
 * The first pass took twelve each, which was a cap chosen to get through the
 * run quickly rather than because twelve is the right number — Bijelo Dugme
 * alone has over a thousand recordings. The artist id is already known, so this
 * is one request per artist instead of two.
 */
import fs from 'node:fs/promises';

const UA = 'Octava/0.1 ( solakmirnes.dev@gmail.com )';
const WANT = Number(process.env.WANT || 25);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACK_NUMBER = /^\s*\d{1,2}\s*[.)-]\s*/;
const BRACKETED = /\s*[([][^)\]]*[)\]]\s*/g;
const tidy = (raw) => String(raw || '')
  .replace(TRACK_NUMBER, '').replace(BRACKETED, ' ')
  .replace(/\s+/g, ' ').trim().replace(/[,;]+$/, '');

const path = new URL('./titles.json', import.meta.url);
const data = JSON.parse(await fs.readFile(path, 'utf8'));
const entries = Object.entries(data.result);

let grew = 0;

for (const [i, [name, entry]] of entries.entries()) {
  try {
    let res = null;
    for (const wait of [1000, 4000, 12000]) {
      res = await fetch(
        `https://musicbrainz.org/ws/2/recording?artist=${entry.mbid}&fmt=json&limit=100`,
        { headers: { 'User-Agent': UA } }
      );
      if (res.ok) break;
      await pause(wait);
    }
    if (!res?.ok) { console.log(`  [${i + 1}] ${name} → preskocen`); await pause(1100); continue; }

    const recs = (await res.json()).recordings || [];
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

    const before = entry.titles.length;
    entry.titles = [...counts.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, WANT)
      .map((e) => [...e.forms.entries()].sort((x, y) => y[1] - x[1])[0][0]);

    if (entry.titles.length > before) grew++;
    console.log(`  [${i + 1}/${entries.length}] ${name} → ${before} → ${entry.titles.length}`);
  } catch {
    console.log(`  [${i + 1}/${entries.length}] ${name} → GRESKA`);
  }
  await pause(1100);
}

await fs.writeFile(path, JSON.stringify(data, null, 2));
const total = Object.values(data.result).reduce((s, v) => s + v.titles.length, 0);
console.log(`\n  prosireno kod ${grew} izvodjaca · naslova ukupno ${total}`);
