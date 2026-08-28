/**
 * Portraits for the catalogue, from Wikimedia Commons.
 *
 *   node scripts/seed/artist-photos.js                 # report only
 *   node scripts/seed/artist-photos.js --apply         # download and store
 *   node scripts/seed/artist-photos.js --apply --force # replace existing
 *
 * AI-DECISION: the artist is resolved by MusicBrainz id, never by name. A name
 * search is how you end up with a Brazilian singer filed under "Regina" — the
 * exact mistake this project already made once, documented in AI-NOTES §6. The
 * mbid is an identity; the name is a string that several people share.
 *
 * AI-DECISION: Commons only, and only the licences that are actually free.
 * A photograph is the photographer's work from the moment of the shutter, so
 * press shots and search-engine results are not available to this site whatever
 * they look like. What makes Commons usable is that the licence is explicit and
 * machine-readable — and the attribution it demands is stored beside the bytes,
 * because CC BY is free *with credit* and worthless without it.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { env } from '../../src/config/env.js';
import Artist from '../../src/models/Artist.js';
import { mb, pause } from '../lib/musicbrainz.js';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];

const MAX_BYTES = 100 * 1024;
const EDGE = 400;               // stored square, in pixels
const UA = 'Octava/1.0 (https://octava.ba; solakmirnes.dev@gmail.com)';

/**
 * Licences this site may actually use.
 *
 * AI-TRAP: NonCommercial and NoDerivatives are NOT free for this. NC forbids the
 * commercial use a public site amounts to, and ND forbids the square crop below
 * — a derivative. They sit on Commons beside the free ones and read like the
 * same family, which is exactly how they get used by mistake.
 */
const FREE = /^(cc0|public domain|pd-|cc[ -]by(?![ -]*(nc|nd))([ -]sa)?)/i;
const BANNED = /\b(nc|nd|non[- ]?commercial|noderiv|fair use|all rights)\b/i;

const strip = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function json(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 60)}`);
  return res.json();
}

/** mbid -> Wikidata Q-id, or null. */
async function wikidataId(mbid) {
  // Leading slash and fmt=json both matter: BASE has no trailing slash, and
  // MusicBrainz answers in XML unless the format is asked for.
  const artist = await mb(`/artist/${mbid}?inc=url-rels&fmt=json`);
  const rel = (artist?.relations || []).find((r) => r.type === 'wikidata');
  return rel ? rel.url.resource.split('/').pop() : null;
}

/** Wikidata Q-id -> the Commons filename in P18, or null. */
async function commonsFile(q) {
  const data = await json(`https://www.wikidata.org/wiki/Special:EntityData/${q}.json`);
  return data.entities?.[q]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
}

/** Commons filename -> { url, licence, author, page } if the licence is free. */
async function freeImage(file) {
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'
    + '&iiprop=extmetadata|url&iiurlwidth=900&titles=File:' + encodeURIComponent(file);
  const data = await json(api);
  const page = Object.values(data.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;

  const meta = info.extmetadata || {};
  const licence = strip(meta.LicenseShortName?.value) || '?';
  const author = strip(meta.Artist?.value) || 'nepoznat';

  if (BANNED.test(licence) || !FREE.test(licence)) {
    return { rejected: licence };
  }
  return {
    url: info.thumburl || info.url,
    licence,
    author: author.slice(0, 200),
    page: info.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`
  };
}

/**
 * A square WebP under the ceiling.
 *
 * AI-NOTE: the crop is taken from the upper part of the frame, not the middle.
 * These are standing publicity shots far more often than head-and-shoulders, and
 * a centred square on a full-body photo returns a picture of somebody's chest.
 */
function toWebp(buffer, dir) {
  const src = join(dir, 'in');
  writeFileSync(src, buffer);

  const dims = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', src], { encoding: 'utf8' });
  const w = Number(dims.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const h = Number(dims.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!w || !h) throw new Error('nečitljive dimenzije');

  const side = Math.min(w, h);
  const x = Math.round((w - side) / 2);
  const y = h > w ? Math.round((h - side) * 0.15) : 0;   // bias upward

  for (const q of [82, 72, 62, 52, 42]) {
    const out = join(dir, `out-${q}.webp`);
    execFileSync('cwebp', [
      '-quiet', '-crop', String(x), String(y), String(side), String(side),
      '-resize', String(EDGE), String(EDGE), '-q', String(q), src, '-o', out
    ]);
    const bytes = readFileSync(out);
    if (bytes.length <= MAX_BYTES) return { bytes, quality: q };
  }
  return null;
}

async function main() {
  await mongoose.connect(env.MONGODB_URI);

  const filter = { mbid: { $exists: true, $nin: [null, ''] } };
  if (ONLY) filter.slug = ONLY;
  const artists = await Artist.find(filter).sort({ name: 1 });

  const dir = mkdtempSync(join(tmpdir(), 'octava-img-'));
  const tally = { stored: 0, noWikidata: 0, noImage: 0, notFree: 0, skipped: 0, failed: 0 };
  const rejected = [];

  console.log(`${artists.length} izvođača sa mbid${APPLY ? '' : '   [probni hod — ništa se ne upisuje]'}\n`);

  for (const a of artists) {
    if (a.imageBytes && !FORCE) { tally.skipped++; continue; }
    const label = '  ' + a.name.padEnd(24);

    try {
      const q = await wikidataId(a.mbid);
      if (!q) { console.log(label + 'nema Wikidata veze'); tally.noWikidata++; continue; }

      const file = await commonsFile(q);
      if (!file) { console.log(label + q.padEnd(11) + 'nema sliku'); tally.noImage++; continue; }

      const img = await freeImage(file);
      if (!img) { console.log(label + 'Commons ne odgovara'); tally.failed++; continue; }
      if (img.rejected) {
        console.log(label + 'licenca odbijena: ' + img.rejected);
        rejected.push({ artist: a.name, licence: img.rejected });
        tally.notFree++;
        continue;
      }

      if (!APPLY) {
        console.log(label + img.licence.padEnd(16) + img.author.slice(0, 34));
        tally.stored++;
        continue;
      }

      const res = await fetch(img.url, { headers: { 'User-Agent': UA } });
      const made = toWebp(Buffer.from(await res.arrayBuffer()), dir);
      if (!made) { console.log(label + 'ne stane u ' + (MAX_BYTES / 1024) + ' KB'); tally.failed++; continue; }

      a.image = made.bytes;
      a.imageType = 'image/webp';
      a.imageBytes = made.bytes.length;
      a.imageUpdatedAt = new Date();
      a.imageAuthor = img.author;
      a.imageLicense = img.licence;
      a.imageSource = img.page;
      await a.save();

      console.log(label + String(Math.round(made.bytes.length / 1024) + ' KB').padEnd(7)
        + ('q' + made.quality).padEnd(5) + img.licence.padEnd(15) + img.author.slice(0, 30));
      tally.stored++;
    } catch (err) {
      console.log(label + 'greška: ' + String(err.message).slice(0, 50));
      tally.failed++;
    }
    await pause(1100);   // MusicBrainz asks for one request a second
  }

  console.log('\n  ' + '─'.repeat(52));
  console.log(`  sa slikom      ${tally.stored}`);
  console.log(`  preskočeno     ${tally.skipped} (već imaju)`);
  console.log(`  nema Wikidata  ${tally.noWikidata}`);
  console.log(`  nema slike     ${tally.noImage}`);
  console.log(`  licenca        ${tally.notFree}`);
  console.log(`  greška         ${tally.failed}`);
  if (rejected.length) {
    writeFileSync('scripts/seed/photos-rejected.json', JSON.stringify(rejected, null, 2));
    console.log('\n  odbijene licence zapisane u scripts/seed/photos-rejected.json');
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
