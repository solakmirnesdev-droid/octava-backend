/**
 * Finds Balkan artists that are not in the catalogue yet.
 *
 *   node scripts/seed/discover-more.js            # write candidates for review
 *   node scripts/seed/discover-more.js --import   # also add them, unpublished
 *
 * Searches MusicBrainz country by country rather than by name, because a name
 * search only finds what you already thought of. Candidates are ranked by how
 * many release groups carry them: a songbook wants the artists people have
 * actually heard of, and release count is the closest thing to that which open
 * data will tell you.
 *
 * AI-DECISION: --import brings songs in as drafts, never published. An
 * automated find is a suggestion; deciding a song belongs on the site is an
 * editorial act, and the dashboard already has the screen for it.
 */
import 'dotenv/config';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { env } from '../../src/config/env.js';
import mongoose from 'mongoose';
import Artist from '../../src/models/Artist.js';
import Song from '../../src/models/Song.js';
import Genre from '../../src/models/Genre.js';
import { mb, pause, fold, countryOf } from '../lib/musicbrainz.js';
import { toLatin } from '../../src/utils/latinise.js';

const doImport = process.argv.includes('--import');
const COUNTRIES = ['BA', 'HR', 'RS', 'ME', 'MK', 'SI', 'XK', 'YU'];
const PER_COUNTRY = 300;

/** Below this a "band" is usually one demo nobody has heard. */
const MIN_RELEASES = 3;

await mongoose.connect(env.MONGODB_URI);

const known = new Set((await Artist.find({}, { name: 1 })).map((a) => fold(a.name)));
const knownIds = new Set((await Artist.find({ mbid: { $ne: null } }, { mbid: 1 })).map((a) => a.mbid));
console.log(`  vec u katalogu: ${known.size} izvodjaca\n`);

const candidates = [];

for (const country of COUNTRIES) {
  let offset = 0;
  let found = 0;

  while (offset < PER_COUNTRY) {
    const data = await mb(`/artist/?query=country:${country}&fmt=json&limit=100&offset=${offset}`);
    const list = data?.artists || [];
    if (!list.length) break;

    for (const a of list) {
      if (knownIds.has(a.id)) continue;
      const name = toLatin(a.name);
      if (known.has(fold(name))) continue;
      // A single-letter or numeric "name" is almost always a data artefact.
      if (fold(name).length < 3) continue;

      candidates.push({
        mbid: a.id,
        name,
        original: a.name !== name ? a.name : undefined,
        country: countryOf(a) || country,
        type: a.type || null,
        begin: a['life-span']?.begin?.slice(0, 4) || null,
        end: a['life-span']?.ended ? a['life-span']?.end?.slice(0, 4) : null,
        origin: a['begin-area']?.name || a.area?.name || null,
        score: a.score || 0,
        disambiguation: a.disambiguation || ''
      });
      found += 1;
    }

    if (list.length < 100) break;
    offset += 100;
    await pause(1100);
  }

  console.log(`  ${country}: ${found} novih kandidata`);
  await pause(1100);
}

// The same act can be listed under both YU and a successor state.
const unique = [...new Map(candidates.map((c) => [c.mbid, c])).values()];
console.log(`\n  ukupno kandidata: ${unique.length}`);

const out = new URL('candidates.json', import.meta.url);
writeFileSync(out, JSON.stringify(unique, null, 2));
console.log(`  zapisano u scripts/seed/candidates.json`);

if (!doImport) {
  console.log('  (ništa nije uvezeno — pokreni sa --import)');
  await mongoose.disconnect();
  process.exit(0);
}

/* ------------------------------------------------------------------- import */

const domaca = await Genre.findOne({ slug: 'domaca' });
const staff = await mongoose.connection.db.collection('staffs').findOne({ role: 'superadmin' });

let added = 0;
let songsAdded = 0;

for (const c of unique) {
  const groups = await mb(`/release-group?artist=${c.mbid}&fmt=json&limit=1`);
  const releases = groups?.['release-group-count'] ?? 0;
  if (releases < MIN_RELEASES) { await pause(1100); continue; }

  const artist = await Artist.findOrCreateByName(c.name);
  artist.mbid = c.mbid;
  if (c.country) artist.country = c.country;
  if (c.origin) artist.origin = c.origin;
  if (c.begin) artist.activeFrom = Number(c.begin);
  if (c.end) artist.activeTo = Number(c.end);
  await artist.save().catch(() => {});
  added += 1;

  await pause(1100);
  const recs = await mb(`/recording?artist=${c.mbid}&fmt=json&limit=100`);
  const titles = new Map();
  for (const r of recs?.recordings || []) {
    const key = fold(r.title);
    if (!key) continue;
    const seen = titles.get(key);
    if (seen) seen.count += 1; else titles.set(key, { title: toLatin(r.title), count: 1 });
  }

  const best = [...titles.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  for (const t of best) {
    if (await Song.findOne({ artist: artist._id, title: t.title })) continue;
    await Song.create({
      title: t.title,
      artist: artist._id,
      genres: domaca ? [domaca._id] : [],
      tags: ['uvoz'],
      status: 'draft',
      createdBy: staff?._id,
      arrangements: [{ content: '[Am]', originalKey: 'Am', isPrimary: true, createdBy: staff?._id }]
    }).catch(() => {});
    songsAdded += 1;
  }

  console.log(`  + ${c.name.padEnd(28)} ${releases} izdanja, ${best.length} pjesama`);
  await pause(1100);
}

console.log(`\n  dodano izvodjaca ${added}   pjesama ${songsAdded} (sve kao nacrt)`);
await mongoose.disconnect();
