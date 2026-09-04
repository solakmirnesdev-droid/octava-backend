import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';
import { nepotpuna, stoFali, SMETA_CITAOCU } from '../src/utils/songQuality.js';

/**
 * Search puts relevance first, completeness second, views last.
 *
 * These exist because probing the live catalogue could not answer the question:
 * the controller's score is max(title, artist, lyrics), so grouping results by
 * a recomputed title score compares songs that never had the same relevance and
 * reports violations that are not there. Fixed rows and a fixed query settle it.
 */

let Song;
let Artist;
let base;

before(async () => {
  base = await start();
  ({ default: Song } = await import('../src/models/Song.js'));
  ({ default: Artist } = await import('../src/models/Artist.js'));
});
after(stop);
beforeEach(reset);

const TEKST = '[Strofa 1]\n[Am]prvi red teksta [F]ide ovdje\n[C]drugi red teksta [G]ide ovdje\n';

/** A published song whose title is exactly `title`, with the given flags. */
async function pjesma(title, flags, views = 0) {
  const artist = await Artist.create({ name: `Izvodjac ${title}` });
  return Song.create({
    title,
    artist: artist._id,
    status: 'published',
    views,
    arrangements: [{ content: TEKST, originalKey: 'Am', difficulty: 'easy' }],
    quality: { score: flags.length ? 60 : 100, flags, checkedAt: new Date() }
  });
}

/** Titles in the order search returned them. */
async function trazi(q) {
  const res = await api(`/songs/search?q=${encodeURIComponent(q)}&limit=50`);
  assert.equal(res.status, 200);
  return (res.body.songs || []).map((s) => s.title);
}

describe('quality flags', () => {
  test('only reader-facing flags count as incomplete', () => {
    assert.equal(nepotpuna({ flags: ['sekcija-bez-akorda'] }), true);
    assert.equal(nepotpuna({ flags: ['prazna-pjesma'] }), true);

    // Tidiness is not incompleteness: a stray space does not make a song
    // less useful to somebody holding a guitar.
    assert.equal(nepotpuna({ flags: ['dupli-razmak'] }), false);
    assert.equal(nepotpuna({ flags: ['crtice', 'potpis', 'nema-refren'] }), false);

    assert.equal(nepotpuna({ flags: [] }), false);
    assert.equal(nepotpuna(undefined), false);
  });

  test('stoFali reports only the flags a reader would run into', () => {
    const fali = stoFali({ flags: ['dupli-razmak', 'sekcija-bez-akorda', 'crtice'] });
    assert.deepEqual(fali, ['sekcija-bez-akorda']);
    assert.ok(SMETA_CITAOCU.includes('kratak-tekst'));
  });
});

describe('search ranking', () => {
  test('at equal relevance, a complete song outranks an incomplete one', async () => {
    // Identical titles, so every candidate scores the same on relevance and
    // completeness is the only thing left to decide the order.
    await pjesma('Nocas', ['sekcija-bez-akorda']);
    await pjesma('Nocas', []);

    const titles = await trazi('Nocas');
    assert.equal(titles.length, 2);

    const res = await api('/songs/search?q=Nocas&limit=50');
    const ids = res.body.songs.map((s) => s.id || s._id);
    const rows = await Song.find({ _id: { $in: ids } }).select('quality').lean();
    const byId = new Map(rows.map((r) => [String(r._id), r.quality]));

    assert.equal(nepotpuna(byId.get(String(ids[0]))), false, 'prva mora biti potpuna');
    assert.equal(nepotpuna(byId.get(String(ids[1]))), true, 'nepotpuna ide iza');
  });

  test('relevance still wins: a better title match beats a complete song', async () => {
    // "Nocas" is the exact query; "Nocas i sutra" only contains it. The exact
    // match is incomplete and must still come first — this reorders, it does
    // not filter, and it must never override what the reader actually typed.
    await pjesma('Nocas', ['sekcija-bez-akorda']);
    await pjesma('Nocas i sutra', []);

    const titles = await trazi('Nocas');
    assert.equal(titles[0], 'Nocas');
  });

  test('views break the tie only after completeness', async () => {
    await pjesma('Zora', ['kratak-tekst'], 5000);
    await pjesma('Zora', [], 0);

    const res = await api('/songs/search?q=Zora&limit=50');
    const ids = res.body.songs.map((s) => s.id || s._id);
    const rows = await Song.find({ _id: { $in: ids } }).select('quality').lean();
    const byId = new Map(rows.map((r) => [String(r._id), r.quality]));

    assert.equal(
      nepotpuna(byId.get(String(ids[0]))),
      false,
      'pet hiljada pregleda ne smije preteci potpunu pjesmu'
    );
  });

  test('an incomplete song is still findable by its own title', async () => {
    await pjesma('Samotna', ['prazna-pjesma']);
    const titles = await trazi('Samotna');
    assert.deepEqual(titles, ['Samotna']);
  });
});
