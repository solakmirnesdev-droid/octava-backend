/**
 * Fills in the country for artists that have none.
 *
 *   node scripts/verify/countries.js           # report only
 *   node scripts/verify/countries.js --write   # also save
 *
 * A narrow companion to artists.js, and narrow on purpose. That script resolves
 * every artist by *searching* MusicBrainz by name, which is several requests
 * each across the whole catalogue — run against a rate limiter already saying
 * 503, it spends an hour in backoff and fills nothing. These artists already
 * carry an mbid, so one lookup apiece answers the only question being asked.
 *
 * AI-NOTE: the country is read rather than recalled. `origin` cannot stand in
 * for it — it holds a city, and sometimes the wrong one: Dragana Mirković's
 * says Wien because that is where she lives, and Zaim Imamović's says Republika
 * Srpska, which is not a country. See AI-NOTES.md §5 on why this catalogue is
 * checked against MusicBrainz instead of trusted.
 *
 * Only ever fills a blank. Never overwrites a country already set.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import { mb, countryOf, pause, BALKAN } from '../lib/musicbrainz.js';

const WRITE = process.argv.includes('--write');

await mongoose.connect(process.env.MONGODB_URI);

const missing = await Artist.find({ deletedAt: null, country: { $exists: false } })
  .select('name mbid origin songCount').sort({ name: 1 });

console.log(`\n  ${missing.length} izvodjaca bez drzave${WRITE ? ' (sa upisom)' : ''}\n`);

let filled = 0;
const unresolved = [];

for (const artist of missing) {
  if (!artist.mbid) {
    unresolved.push({ name: artist.name, why: 'nema MusicBrainz id' });
    console.log(`  ${artist.name.padEnd(22)} —    preskaceno (nema mbid)`);
    continue;
  }

  let data = null;
  try {
    data = await mb(`/artist/${artist.mbid}?fmt=json`);
  } catch (err) {
    unresolved.push({ name: artist.name, why: err.message });
    console.log(`  ${artist.name.padEnd(22)} —    GRESKA ${err.message}`);
    continue;
  }

  const country = data ? countryOf(data) : null;
  if (!country) {
    unresolved.push({ name: artist.name, why: 'MusicBrainz nema drzavu' });
    console.log(`  ${artist.name.padEnd(22)} —    nema drzave kod njih (area: ${data?.area?.name || '—'})`);
    await pause(1200);
    continue;
  }

  /**
   * AI-TRAP: a country from outside the region is reported and NOT written.
   *
   * MusicBrainz records where an artist is based, which is not where their
   * music is from. Dragana Mirković comes back AT because she lives in Vienna;
   * writing that would hand her and thirty songs to the region filter, which
   * deletes anything outside BA/HR/ME/RS. An empty field is a question. A wrong
   * field is a deletion.
   */
  if (!BALKAN.has(country)) {
    unresolved.push({ name: artist.name, why: `MusicBrainz kaze ${country} — van regije, nije upisano` });
    console.log(`  ${artist.name.padEnd(22)} ${country}  <- VAN REGIJE, ne upisujem`);
    await pause(1200);
    continue;
  }

  console.log(`  ${artist.name.padEnd(22)} ${country}`);

  if (WRITE) {
    artist.country = country;
    await artist.save();
  }
  filled += 1;

  // One request per second is what they ask for; 1.2 leaves room for drift.
  await pause(1200);
}

console.log(`\n  popunjeno: ${filled}${WRITE ? '' : ' (probni prolaz — nista nije upisano)'}`);
if (unresolved.length) {
  console.log(`  ostalo bez drzave: ${unresolved.length}`);
  for (const u of unresolved) console.log(`    ${u.name} — ${u.why}`);
}
console.log('');

await mongoose.disconnect();
