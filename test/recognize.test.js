import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';
import { fingerprint, packHashes, SAMPLE_RATE } from '../src/utils/fingerprint.js';

/**
 * The endpoint around the fingerprint.
 *
 * utils/fingerprint.test.js proves the algorithm identifies audio. This proves
 * the parts around it: that a print reaches storage intact, that the cache in
 * front of matching is dropped when a print changes, and that recognition
 * declines rather than guessing. The failure mode is the same one throughout —
 * nothing throws, it just quietly stops matching.
 */

let Song, Artist, Staff, AudioPrint;
let baseUrl;

before(async () => {
  baseUrl = await start();
  ({ default: Song } = await import('../src/models/Song.js'));
  ({ default: Artist } = await import('../src/models/Artist.js'));
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: AudioPrint } = await import('../src/models/AudioPrint.js'));
});
after(stop);
beforeEach(reset);

const rng = (seed) => {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
};

/** Two recordings that share no key, tempo, progression or timbre. */
const PIECES = {
  a: { key: 110.00, shape: [0, 5, 3, 4], bar: 1.20, partials: [1, 1.5, 2] },
  b: { key: 233.08, shape: [0, 10, 8, 6], bar: 3.10, partials: [1, 2.5, 5] }
};

function render(piece, seconds) {
  const rand = rng(Math.round(piece.key * 100));
  const out = new Float32Array(seconds * SAMPLE_RATE);
  const beat = piece.bar / 4;

  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const f0 = piece.key * Math.pow(2, piece.shape[Math.floor(t / piece.bar) % piece.shape.length] / 12);

    let v = 0;
    for (const ratio of piece.partials) v += Math.sin(2 * Math.PI * f0 * ratio * t) / (1 + ratio * 1.4);

    const since = t % beat;
    if (since < 0.02) v += rand() * 2.2 * (1 - since / 0.02);
    out[i] = v * 0.25;
  }
  return out;
}

const printOf = (piece) => packHashes(fingerprint(render(piece, 30)));
const clipOf = (piece, from, secs) =>
  packHashes(fingerprint(render(piece, 30).slice(from * SAMPLE_RATE, (from + secs) * SAMPLE_RATE)));

/** The JSON helper cannot post bytes, and fingerprints are bytes. */
async function bytes(path, body, { method = 'POST', token } = {}) {
  const headers = { 'Content-Type': 'application/octet-stream' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(baseUrl + path, { method, headers, body });
  const type = res.headers.get('content-type') || '';

  return {
    status: res.status,
    body: type.includes('json') ? await res.json().catch(() => ({})) : null,
    raw: type.includes('json') ? null : Buffer.from(await res.arrayBuffer())
  };
}

async function signIn(role = 'admin') {
  const email = `${role}@test.local`;
  await Staff.create({
    email, name: role, role, passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email, password: 'lozinka1234' }
  });
  return res.body.token;
}

async function makeSong(title) {
  const artist = await Artist.findOrCreateByName('Testni');
  return Song.create({
    title, artist: artist._id, status: 'published',
    arrangements: [{ content: '[Am]a', originalKey: 'Am', isPrimary: true }]
  });
}

describe('indexing', () => {
  test('a fingerprint is stored and shows up in the listing', async () => {
    const token = await signIn();
    const song = await makeSong('Prva');
    const print = printOf(PIECES.a);

    const put = await bytes(`/recognize/${song._id}?seconds=30`, print, { method: 'PUT', token });
    assert.equal(put.status, 200);
    assert.equal(put.body.hashCount, print.length / 6);

    const listed = await api('/recognize', { token });
    assert.equal(listed.body.prints.length, 1);
    assert.equal(listed.body.prints[0].stale, false);
  });

  test('the audio never reaches the server', async () => {
    // What is stored has to be the packed integers and nothing else — the
    // licensing answer and the storage answer are the same answer.
    const token = await signIn();
    const song = await makeSong('Prva');
    const print = printOf(PIECES.a);
    await bytes(`/recognize/${song._id}?seconds=30`, print, { method: 'PUT', token });

    const stored = await AudioPrint.findOne({ song: song._id }).select('+hashes');
    assert.equal(stored.hashes.length, print.length);
    assert.equal(stored.hashes.length % 6, 0);
  });

  test('indexing requires signing in', async () => {
    const song = await makeSong('Prva');
    const res = await bytes(`/recognize/${song._id}?seconds=30`, printOf(PIECES.a), { method: 'PUT' });
    assert.equal(res.status, 401);
  });

  test('a fingerprint not divisible by six is refused', async () => {
    const token = await signIn();
    const song = await makeSong('Prva');
    const res = await bytes(`/recognize/${song._id}?seconds=30`, Buffer.alloc(7), { method: 'PUT', token });
    assert.equal(res.status, 400);
  });

  test('duration is required', async () => {
    const token = await signIn();
    const song = await makeSong('Prva');
    const res = await bytes(`/recognize/${song._id}`, printOf(PIECES.a), { method: 'PUT', token });
    assert.equal(res.status, 400);
  });
});

describe('recognition', () => {
  test('an empty index says so', async () => {
    const res = await bytes('/recognize', clipOf(PIECES.a, 5, 8));
    assert.equal(res.body.match, null);
    assert.equal(res.body.reason, 'empty');
  });

  test('a clip finds its own song', async () => {
    const token = await signIn();
    const song = await makeSong('Prva');
    await bytes(`/recognize/${song._id}?seconds=30`, printOf(PIECES.a), { method: 'PUT', token });

    const res = await bytes('/recognize', clipOf(PIECES.a, 9, 8));
    assert.equal(res.body.match?.slug, song.slug);
    assert.equal(res.body.match.artist.name, 'Testni');
    // The clip starts at nine seconds and the reported position should agree.
    assert.ok(Math.abs(res.body.match.atSecond - 9) <= 1,
      `pozicija ${res.body.match.atSecond} nije blizu 9s`);
  });

  test('a clip from elsewhere gives no match', async () => {
    const token = await signIn();
    const song = await makeSong('Prva');
    await bytes(`/recognize/${song._id}?seconds=30`, printOf(PIECES.a), { method: 'PUT', token });

    const res = await bytes('/recognize', clipOf(PIECES.b, 9, 8));
    assert.equal(res.body.match, null);
    assert.equal(res.body.reason, 'unsure');
  });

  test('an empty body is refused', async () => {
    assert.equal((await bytes('/recognize', Buffer.alloc(0))).status, 400);
  });
});

describe('the cache', () => {
  /**
   * AI-TRAP: the cache in front of matching is the one thing here that fails
   * silently. Left stale it keeps answering with the print a song used to have,
   * which looks like a working feature returning a wrong answer.
   */
  test('a replaced fingerprint applies immediately', async () => {
    const token = await signIn();
    const song = await makeSong('Prva');

    await bytes(`/recognize/${song._id}?seconds=30`, printOf(PIECES.a), { method: 'PUT', token });
    assert.equal((await bytes('/recognize', clipOf(PIECES.a, 9, 8))).body.match?.slug, song.slug);

    // Same song, different recording. The old clip must stop matching.
    await bytes(`/recognize/${song._id}?seconds=30`, printOf(PIECES.b), { method: 'PUT', token });
    assert.equal((await bytes('/recognize', clipOf(PIECES.a, 9, 8))).body.match, null);
    assert.equal((await bytes('/recognize', clipOf(PIECES.b, 9, 8))).body.match?.slug, song.slug);
  });

  test('a deleted fingerprint stops matching', async () => {
    const token = await signIn();
    const song = await makeSong('Prva');
    await bytes(`/recognize/${song._id}?seconds=30`, printOf(PIECES.a), { method: 'PUT', token });

    const gone = await api(`/recognize/${song._id}`, { method: 'DELETE', token });
    assert.equal(gone.status, 200);
    assert.equal((await bytes('/recognize', clipOf(PIECES.a, 9, 8))).body.match, null);
  });
});

describe('the offline copy', () => {
  test('returns the manifest and the bytes in one response', async () => {
    const token = await signIn();
    const song = await makeSong('Prva');
    const print = printOf(PIECES.a);
    await bytes(`/recognize/${song._id}?seconds=30`, print, { method: 'PUT', token });

    const res = await bytes(`/recognize/offline?songs=${song._id}`, undefined, { method: 'GET' });
    const headerBytes = res.raw.readUInt32LE(0);
    const manifest = JSON.parse(res.raw.subarray(4, 4 + headerBytes).toString('utf8'));

    assert.equal(manifest.prints.length, 1);
    assert.equal(manifest.prints[0].bytes, print.length);
    assert.equal(res.raw.length, 4 + headerBytes + print.length);
  });

  test('without a song list it does not send the whole library', async () => {
    assert.equal((await bytes('/recognize/offline', undefined, { method: 'GET' })).status, 400);
  });
});
