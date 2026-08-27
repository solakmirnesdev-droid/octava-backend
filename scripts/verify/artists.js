/**
 * Checks every artist in the catalogue against MusicBrainz.
 *
 *   node scripts/verify/artists.js            # report only
 *   node scripts/verify/artists.js --apply    # also fill in what is missing
 *
 * The catalogue was assembled from a mix of MusicBrainz imports and names typed
 * from memory, and the typed ones turned out to carry wrong attributions. This
 * answers the first question that matters: does this person exist, and are they
 * from here?
 *
 * AI-NOTE: --apply only ever *fills in* — country, origin, years, MusicBrainz
 * id. It never renames and never deletes. An artist that cannot be found is
 * reported for a person to look at, because "MusicBrainz has not heard of them"
 * and "they are not real" are different statements.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { env } from '../../src/config/env.js';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import { findArtist, mb, countryOf, pause, fold } from '../lib/musicbrainz.js';
import { toLatin } from '../../src/utils/latinise.js';

const apply = process.argv.includes('--apply');
/**
 * Re-resolve an artist even when they already carry an id.
 *
 * AI-NOTE: needed once the search itself improved. An id assigned by a worse
 * search stays wrong forever otherwise — "Kaliopi" was pinned to a 1980s band
 * rather than to the solo singer whose songs we actually hold.
 */
const refresh = process.argv.includes('--refresh');

await mongoose.connect(env.MONGODB_URI);
const artists = await Artist.find().sort({ name: 1 });
console.log(`  provjeravam ${artists.length} izvodjaca${apply ? ' (sa upisom)' : ''}\n`);

const report = { checked: 0, found: 0, missing: [], filled: [], mismatched: [] };

for (const [i, artist] of artists.entries()) {
  report.checked += 1;

  // A placeholder for songs nobody wrote, not a person to look up.
  if (fold(artist.name) === 'tradicionalna') {
    console.log(`  ${String(i + 1).padStart(3)}. ${artist.name.padEnd(24)} preskaceno (nosilac narodnih)`);
    continue;
  }

  let hit = null;
  try {
    hit = await findArtist(artist.name, { toLatin });
  } catch (err) {
    console.log(`  ${String(i + 1).padStart(3)}. ${artist.name.padEnd(24)} GRESKA ${err.message}`);
    await pause(2000);
    continue;
  }

  if (!hit) {
    const songs = await Song.countDocuments({ artist: artist._id });
    report.missing.push({ name: artist.name, slug: artist.slug, songs });
    console.log(`  ${String(i + 1).padStart(3)}. ${artist.name.padEnd(24)} NIJE NADJEN  (${songs} pjesama)`);
    await pause(1100);
    continue;
  }

  report.found += 1;
  const country = countryOf(hit);
  const begin = hit['life-span']?.begin?.slice(0, 4);
  const end = hit['life-span']?.ended ? hit['life-span']?.end?.slice(0, 4) : null;
  const origin = hit['begin-area']?.name || hit.area?.name || null;

  // A name that folds differently is worth a person's eye: it is either a
  // spelling to correct or the wrong artist entirely.
  if (fold(toLatin(hit.name)) !== fold(artist.name)) {
    report.mismatched.push({ ours: artist.name, theirs: hit.name, mbid: hit.id });
  }

  const changes = [];
  if (!artist.country && country) { changes.push(`drzava=${country}`); if (apply) artist.country = country; }
  if (!artist.origin && origin) { changes.push(`porijeklo=${origin}`); if (apply) artist.origin = origin; }
  if (!artist.activeFrom && begin) { changes.push(`od=${begin}`); if (apply) artist.activeFrom = Number(begin); }
  if (!artist.activeTo && end) { changes.push(`do=${end}`); if (apply) artist.activeTo = Number(end); }
  if (!artist.mbid) {
    changes.push('mbid');
    if (apply) artist.mbid = hit.id;
  } else if (refresh && artist.mbid !== hit.id) {
    changes.push(`mbid ISPRAVLJEN`);
    report.mismatched.push({ ours: artist.name, was: artist.mbid, now: hit.id, theirs: hit.name });
    if (apply) artist.mbid = hit.id;
  }

  // AI-TRAP: one artist that will not save must not end the run. The first
  // attempt died on Aleksa Šantić (born 1868) against a year floor of 1900, at
  // number four of a hundred and thirty-nine.
  if (apply && changes.length) {
    try {
      artist.verifiedAt = new Date();
      await artist.save();
    } catch (err) {
      report.mismatched.push({ ours: artist.name, problem: err.message });
      console.log(`       ↳ nije spaseno: ${err.message.slice(0, 80)}`);
    }
  }
  if (changes.length) report.filled.push({ name: artist.name, changes });

  const note = fold(toLatin(hit.name)) !== fold(artist.name) ? `  ⚠ MB kaze "${hit.name}"` : '';
  console.log(`  ${String(i + 1).padStart(3)}. ${artist.name.padEnd(24)} ${(country || '??').padEnd(3)} ${(begin || '----')}  ${changes.join(' ') || '—'}${note}`);

  await pause(1100);
}

writeFileSync(new URL('artists-report.json', import.meta.url), JSON.stringify(report, null, 2));

console.log('');
console.log(`  provjereno ${report.checked}   nadjeno ${report.found}   nije nadjeno ${report.missing.length}`);
console.log(`  dopunjeno ${report.filled.length}   imena za pregled ${report.mismatched.length}`);
if (!apply) console.log('  (ništa nije upisano — pokreni sa --apply)');
await mongoose.disconnect();
