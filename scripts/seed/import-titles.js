/**
 * Rebuilds the catalogue's titles from MusicBrainz.
 *
 * Writes a JSON file rather than touching the database directly, so the result
 * can be read before it is trusted — the whole reason for this pass is that the
 * previous titles were written from memory and got attributions wrong.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import { titlesFor } from './musicbrainz.js';

const OUT = new URL('./titles.json', import.meta.url);
const WANT = Number(process.env.WANT || 10);

await mongoose.connect(process.env.MONGODB_URI);
const artists = (await Artist.find({}, { name: 1 }).sort({ name: 1 }))
  .map((a) => a.name)
  .filter((n) => n !== 'Tradicionalna' && n !== 'Aleksa Šantić');
await mongoose.disconnect();

const result = {};
const missing = [];

for (const [i, name] of artists.entries()) {
  try {
    const { artist, titles } = await titlesFor(name, { want: WANT });
    if (!artist || !titles.length) { missing.push(name); }
    else { result[name] = { mbid: artist.id, matched: artist.name, country: artist.country, titles }; }
    console.log(`  [${i + 1}/${artists.length}] ${name} → ${titles.length}`);
  } catch (err) {
    missing.push(`${name} (${err.message})`);
    console.log(`  [${i + 1}/${artists.length}] ${name} → GRESKA`);
    // Back off hard on an error; the limit is per second and unforgiving.
    await new Promise((r) => setTimeout(r, 5000));
  }
}

await fs.writeFile(OUT, JSON.stringify({ generated: new Date().toISOString(), result, missing }, null, 2));
console.log(`\n  izvodjaca sa naslovima: ${Object.keys(result).length}`);
console.log(`  bez rezultata: ${missing.length}`);
