/**
 * Pulls real song titles per artist from MusicBrainz.
 *
 * Replaces titles written from memory, which turned out to carry a fair number
 * of wrong attributions. MusicBrainz core data — artists, recordings, titles —
 * is released under CC0, so this is open data being used as intended rather
 * than someone's catalogue being lifted.
 *
 * Titles arrive dirty: track numbers from sleeve listings, bracketed live and
 * remaster variants, and whatever capitalisation the contributor used. They are
 * cleaned, grouped case-insensitively, and ranked by how many recordings carry
 * them — a song pressed on ten releases is better known than one pressed once,
 * which is the ordering a songbook wants anyway.
 */
const UA = 'Octava/0.1 ( solakmirnes.dev@gmail.com )';
const BASE = 'https://musicbrainz.org/ws/2';

/** MusicBrainz asks for one request per second and will throttle otherwise. */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * AI-TRAP: back off properly, and for longer than feels necessary.
 *
 * The first version retried three times with a flat two-second pause and then
 * threw "MusicBrainz ne odgovara". That read like the service being down; it was
 * their rate limiter asking to be left alone. Twenty artists were lost that way
 * — Dino Merlin, Crvena Jabuka, Lepa Brena among them — scattered through the
 * run rather than clustered, which is exactly what intermittent throttling
 * looks like and exactly what does not look like an outage.
 */
async function mb(path) {
  const waits = [1000, 3000, 8000, 15000, 30000];
  let last = null;

  for (const wait of waits) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA } });
      if (res.ok) return res.json();
      // 503 is the throttle; 5xx generally is worth another try.
      if (res.status >= 500) { last = `HTTP ${res.status}`; await pause(wait); continue; }
      throw new Error(`MusicBrainz ${res.status} na ${path}`);
    } catch (err) {
      if (err.message?.startsWith('MusicBrainz ')) throw err;
      last = err.message;
      await pause(wait);
    }
  }
  throw new Error(`MusicBrainz odustao (${last}) na ${path}`);
}

/**
 * Artists from this region only.
 *
 * A name search returns whoever matches from anywhere on earth, and the top hit
 * is whoever is most famous — which is how "Regina" came back as a Brazilian
 * singer and "Boa" as a Korean one, each with a full catalogue of titles that
 * look plausible until you read them.
 */
const BALKAN = new Set(['YU', 'BA', 'HR', 'RS', 'ME', 'MK', 'SI', 'XK']);

/**
 * Many entries for this repertoire carry no country code at all — the area is a
 * city, or empty. Rejecting those threw away Partibrejkers ("Beograd") and
 * Zaim Imamović (nothing), which is how sixteen artists were lost to a filter
 * rather than to the network.
 */
const REGION_TEXT = /bosnia|herzegovina|croatia|serbia|yugoslav|montenegro|macedon|sloven|kosovo|beograd|belgrade|sarajevo|zagreb|split|rijeka|osijek|novi sad|ni[sš]|skopje|ljubljana|mostar|banja luka|tuzla|zenica|podgorica|pri[sš]tina|subotica|kragujevac|maribor|zadar|pula|dubrovnik/i;

const fromRegion = (a) => {
  const c = a.country || a.area?.['iso-3166-1-codes']?.[0] || null;
  if (c) return BALKAN.has(c);

  const where = [a.area?.name, a['begin-area']?.name, a.disambiguation]
    .filter(Boolean).join(' ');
  return REGION_TEXT.test(where);
};

export async function findArtist(name) {
  const quoted = encodeURIComponent(`artist:"${name}"`);
  let hits = (await mb(`/artist/?query=${quoted}&fmt=json&limit=8`)).artists || [];

  // The exact-phrase query returns nothing for some spellings; the loose one
  // finds them. Toše Proeski was missing for exactly this reason.
  if (!hits.length) {
    await pause(1100);
    hits = (await mb(`/artist/?query=${encodeURIComponent(name)}&fmt=json&limit=8`)).artists || [];
  }
  if (!hits.length) return null;

  const local = hits.filter(fromRegion);

  /**
   * Some entries carry no location at all — Zaim Imamović among them. An exact,
   * unambiguous name match is accepted there: a name like that does not collide
   * with anyone abroad, and the alternative is losing the artist entirely.
   * Anything ambiguous is still refused rather than guessed at.
   */
  if (!local.length) {
    const placeless = hits.filter((a) => !a.country && !a.area);
    const exactPlaceless = placeless.filter((a) => a.name.toLowerCase() === name.toLowerCase());
    if (exactPlaceless.length === 1) return exactPlaceless[0];
    return null;
  }

  const exact = local.find((a) => a.name.toLowerCase() === name.toLowerCase());
  return exact || local[0];
}

/**
 * Words that are never names, so they stay lowercase even for an artist whose
 * entire catalogue was entered in Title Case — where the learned rule below has
 * nothing to go on.
 */
const FUNCTION_WORDS = new Set([
  'i', 'a', 'ali', 'ili', 'pa', 'te', 'da', 'ne', 'li', 'je', 'su', 'sam', 'si', 'smo', 'ste',
  'bi', 'bih', 'cu', 'ces', 'ce', 'cemo', 'cete', 'sve', 'svi', 'sva', 'nas', 'vas', 'nam',
  'u', 'na', 'o', 'od', 'do', 'za', 'sa', 's', 'iz', 'po', 'pri', 'pred', 'kroz', 'uz', 'niz',
  'bez', 'pod', 'nad', 'medu', 'preko', 'oko', 'kod', 'prema', 'zbog', 'radi',
  'me', 'ga', 'ih', 'mi', 'ti', 'on', 'ona', 'ono', 'oni', 'one', 'mu', 'joj', 'im',
  'moj', 'moja', 'moje', 'tvoj', 'tvoja', 'tvoje', 'njen', 'njegov', 'nas', 'nasa', 'vas',
  'taj', 'ta', 'to', 'ovaj', 'ova', 'ovo', 'onaj', 'koji', 'koja', 'koje',
  'kad', 'kada', 'gdje', 'gde', 'kako', 'zasto', 'sto', 'sta', 'ko', 'tko', 'ako', 'jer',
  'jos', 'vec', 'samo', 'bas', 'evo', 'eto', 'ipak', 'nikad', 'uvijek', 'uvek', 'opet',
  'jedan', 'jedna', 'jedno', 'dva', 'tri', 'ni', 'niti', 'nego', 'kao'
]);

const TRACK_NUMBER = /^\s*\d{1,2}\s*[.)-]\s*/;
const BRACKETED = /\s*[([][^)\]]*[)\]]\s*/g;

/**
 * Strips sleeve noise only. Casing is deliberately left alone.
 *
 * AI-TRAP: do not reflow Title Case into sentence case here. It looks right on
 * most titles and quietly destroys the ones carrying a name — "Dobro vam jutro
 * Petrović Petre" came back with a lowercase surname. The correct casing is
 * already in the data; the caller picks the most common surface form instead,
 * which gets it right without guessing which words are names.
 */
function tidy(raw) {
  const t = String(raw || '')
    .replace(TRACK_NUMBER, '')
    .replace(BRACKETED, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;]+$/, '');
  return t;
}

export async function titlesFor(name, { want = 10 } = {}) {
  const artist = await findArtist(name);
  await pause(1100);
  if (!artist) return { artist: null, titles: [] };

  const data = await mb(`/recording?artist=${artist.id}&fmt=json&limit=100`);
  await pause(1100);

  const counts = new Map();
  for (const rec of data.recordings || []) {
    const t = tidy(rec.title);
    // Medleys and sleeve junk; also drops the odd one-word fragment.
    if (t.length < 3 || t.length > 70 || t.includes('/')) continue;
    const key = t.toLowerCase();
    const entry = counts.get(key) || { n: 0, forms: new Map() };
    entry.n += 1;
    // Tally exact spellings so the most common one wins — contributors get the
    // casing right more often than not, and the majority form is that answer.
    entry.forms.set(t, (entry.forms.get(t) || 0) + 1);
    counts.set(key, entry);
  }

  /**
   * Which words are names, learned from the artist's own titles.
   *
   * Contributors for this repertoire tend to enter everything in Title Case, so
   * the majority form is no help. But across a hundred titles a real word turns
   * up lowercase somewhere, while a name never does — that difference is the
   * signal, and it costs nothing to read.
   */
  const everLower = new Set();
  for (const rec of data.recordings || []) {
    for (const w of tidy(rec.title).split(/\s+/)) {
      if (/^[a-zčćžšđ]/.test(w)) everLower.add(w.toLowerCase().replace(/[^\wčćžšđ']/g, ''));
    }
  }

  /**
   * Only reflow when the artist's own titles prove which words are ordinary.
   *
   * AI-TRAP: applying the stoplist alone to a catalogue entered entirely in
   * Title Case produces the worst of both — "Eto! baš Hoću!", function words
   * lowered and everything else left standing. Where there is no evidence, the
   * title is left exactly as it came: consistent Title Case beats a half
   * conversion, and nothing is silently corrupted.
   */
  const evidence = everLower.size >= 8;

  const sentenceCase = (title) => {
    if (!evidence) return title;
    const words = title.split(' ');
    const allCaps = words.length > 2
      && words.filter((w) => /^[A-ZČĆŽŠĐ]/.test(w)).length > words.length * 0.7;
    if (!allCaps) return title;

    return words
      .map((w, i) => {
        if (i === 0) return w;
        const bare = w.toLowerCase().replace(/[^\wčćžšđ']/g, '');
        const plain = bare.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd').replace(/ć/g, 'c').replace(/č/g, 'c')
          .replace(/ž/g, 'z').replace(/š/g, 's');
        const safe = FUNCTION_WORDS.has(plain) || everLower.has(bare);
        return safe ? w.charAt(0).toLowerCase() + w.slice(1) : w;
      })
      .join(' ');
  };

  const titles = [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, want)
    .map((e) => sentenceCase([...e.forms.entries()].sort((x, y) => y[1] - x[1])[0][0]));

  return { artist: { name: artist.name, id: artist.id, country: artist.country }, titles };
}
