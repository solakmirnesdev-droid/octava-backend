/**
 * Finds regional artists we do not have yet, by country rather than by name.
 *
 * Searching name-by-name only ever returns what was already thought of. Asking
 * MusicBrainz who it holds for a country turns up the rest — and since the
 * query is the filter, nothing foreign can arrive in the first place.
 */
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import 'dotenv/config';
import Artist from '../../src/models/Artist.js';

const UA = 'Octava/0.1 ( solakmirnes.dev@gmail.com )';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const COUNTRIES = ['BA', 'HR', 'RS', 'YU', 'ME', 'MK', 'SI'];
const PER_PAGE = 100;
const MAX_PAGES = 6;

async function page(country, type, offset) {
  const q = encodeURIComponent(`country:${country} AND type:${type}`);
  for (const wait of [1000, 4000, 12000]) {
    const res = await fetch(
      `https://musicbrainz.org/ws/2/artist/?query=${q}&fmt=json&limit=${PER_PAGE}&offset=${offset}`,
      { headers: { 'User-Agent': UA } }
    );
    if (res.ok) return res.json();
    await pause(wait);
  }
  return { artists: [] };
}

await mongoose.connect(process.env.MONGODB_URI);
const have = new Set((await Artist.find({}, { name: 1 })).map((a) => a.name.toLowerCase()));
await mongoose.disconnect();

const found = new Map();

for (const country of COUNTRIES) {
  for (const type of ['group', 'person']) {
    for (let p = 0; p < MAX_PAGES; p++) {
      const data = await page(country, type, p * PER_PAGE);
      const rows = data.artists || [];
      if (!rows.length) break;

      for (const a of rows) {
        // The search scores loosely; anything well below the top is noise.
        if ((a.score || 0) < 90) continue;
        const key = a.name.toLowerCase();
        if (have.has(key) || found.has(key)) continue;
        found.set(key, {
          name: a.name, mbid: a.id, country: a.country || country, type: a.type,
          note: a.disambiguation || ''
        });
      }
      console.log(`  ${country}/${type} str.${p + 1} → ukupno novih ${found.size}`);
      if (rows.length < PER_PAGE) break;
      await pause(1100);
    }
  }
}

const out = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
await fs.writeFile(new URL('./discovered.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(`\n  novih izvodjaca: ${out.length}`);
