/**
 * A shared MusicBrainz client.
 *
 * Core data there — artists, recordings, titles, relationships — is released
 * under CC0, so this is open data used as intended rather than someone's
 * catalogue being lifted.
 *
 * AI-NOTE: lifted out of scripts/seed/musicbrainz.js once a second script
 * needed it. The backoff and the region filter below each cost a run to get
 * right; duplicating them would have meant getting them wrong twice.
 */

const UA = 'Octava/0.1 ( solakmirnes.dev@gmail.com )';
const BASE = 'https://musicbrainz.org/ws/2';

/** MusicBrainz asks for one request per second and will throttle otherwise. */
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * AI-TRAP: back off properly, and for longer than feels necessary.
 *
 * An earlier version retried three times with a flat two-second pause and then
 * reported that MusicBrainz was not responding. That read like the service
 * being down; it was their rate limiter asking to be left alone. Twenty artists
 * were lost that way — scattered through the run rather than clustered, which
 * is exactly what intermittent throttling looks like and exactly what an outage
 * does not.
 */
export async function mb(path) {
  const waits = [1000, 3000, 8000, 15000, 30000];
  let last = null;

  for (const wait of waits) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA } });
      if (res.ok) return res.json();
      if (res.status === 404) return null;
      if (res.status >= 500 || res.status === 503) { last = `HTTP ${res.status}`; await pause(wait); continue; }
      throw new Error(`MusicBrainz ${res.status} na ${path}`);
    } catch (err) {
      if (err.message?.startsWith('MusicBrainz ')) throw err;
      last = err.message;
      await pause(wait);
    }
  }
  throw new Error(`MusicBrainz odustao (${last}) na ${path}`);
}

export const BALKAN = new Set(['YU', 'BA', 'HR', 'RS', 'ME', 'MK', 'SI', 'XK']);

/**
 * AI-TRAP: many entries for this repertoire carry no country code at all — the
 * area is a city, or empty. Rejecting those threw away Partibrejkers
 * ("Beograd") and Zaim Imamović (nothing), sixteen artists lost to a filter
 * rather than to the network.
 */
const REGION_TEXT = /bosnia|herzegovina|croatia|serbia|yugoslav|montenegro|macedon|sloven|kosovo|beograd|belgrade|sarajevo|zagreb|split|rijeka|osijek|novi sad|ni[sš]|skopje|ljubljana|mostar|banja luka|tuzla|zenica|podgorica|pri[sš]tina|subotica|kragujevac|maribor|zadar|pula|dubrovnik/i;

export function countryOf(a) {
  return a.country || a.area?.['iso-3166-1-codes']?.[0] || null;
}

export function fromRegion(a) {
  const c = countryOf(a);
  if (c) return BALKAN.has(c);

  const where = [a.area?.name, a['begin-area']?.name, a.disambiguation]
    .filter(Boolean).join(' ');
  return REGION_TEXT.test(where);
}

/** Folds a title or name to a key two spellings share. Mirrors src/utils/foldTitle.js. */
export const fold = (t) => String(t || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[‘’ʼ]/g, "'")
  .replace(/[^\p{L}\p{N}]/gu, '');

/**
 * The best matching artist for a name, from this region.
 *
 * AI-TRAP: three separate things had to be right here, and each one silently
 * lost real artists.
 *
 * 1. `artist:"Name"` finds nothing for half this repertoire. The unquoted query
 *    finds them; the quoted one returns zero for Toše Proeski and Karolina
 *    Gočeva, both of whom MusicBrainz has.
 *
 * 2. MusicBrainz stores Macedonian and Serbian artists in Cyrillic, so the name
 *    coming back is "Тоше Проески" while ours is Latin. Names are compared
 *    after transliterating, or every one of them reads as a different artist.
 *
 * 3. An exact name match with no country at all is accepted. The region filter
 *    exists to stop "Regina" matching a Brazilian singer — but an entry with no
 *    country is unknown, not foreign, and rejecting those lost Zaim Imamović
 *    and Zoster. An entry that names a country outside the region is still
 *    refused.
 */
export async function findArtist(name, { toLatin = (x) => x } = {}) {
  const key = fold(toLatin(name));

  const tries = [
    `artist:"${name}"`,   // precise when it works
    name,                 // what actually finds the Cyrillic entries
    toLatin(name)         // and once more without diacritics
  ];

  const seen = new Map();
  for (const query of tries) {
    const data = await mb(`/artist/?query=${encodeURIComponent(query)}&fmt=json&limit=10`);
    for (const a of data?.artists || []) seen.set(a.id, a);
    if ([...seen.values()].some((a) => fromRegion(a) && fold(toLatin(a.name)) === key)) break;
    await pause(1100);
  }

  const hits = [...seen.values()];
  if (!hits.length) return null;

  const exact = (a) => fold(toLatin(a.name)) === key;

  return hits.find((a) => fromRegion(a) && exact(a))
    || hits.find((a) => exact(a) && !countryOf(a))
    || hits.find(fromRegion)
    || null;
}

/**
 * Every distinct recording title for an artist, with how many recordings carry
 * each. A song pressed on ten releases is better known than one pressed once,
 * which is the ordering a songbook wants anyway.
 */
export async function recordingsOf(mbid, { max = 400 } = {}) {
  const counts = new Map();
  let offset = 0;

  while (offset < max) {
    const data = await mb(`/recording?artist=${mbid}&fmt=json&limit=100&offset=${offset}`);
    const list = data?.recordings || [];
    if (!list.length) break;

    for (const r of list) {
      const key = fold(r.title);
      if (!key) continue;
      const seen = counts.get(key);
      if (seen) seen.count += 1;
      else counts.set(key, { title: r.title, count: 1 });
    }

    if (list.length < 100) break;
    offset += 100;
    await pause(1100);
  }

  return counts;
}
