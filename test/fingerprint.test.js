import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprint, align, best, peaks, SAMPLE_RATE, MIN_RATE
} from '../src/utils/fingerprint.js';

/**
 * Recognition fails in the one way that is hardest to notice: it keeps
 * answering. A fingerprint that has stopped matching returns "no result", which
 * looks exactly like a song that is not in the index, and a scoring rule that
 * has drifted returns a confident wrong title, which looks exactly like a hit.
 * Neither throws. These tests are the only thing that tells the two apart.
 *
 * The audio is synthesised rather than loaded, so the suite carries no
 * recordings and stays deterministic.
 */

const rng = (seed) => {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
};

/**
 * The pieces the library is built from, and one that is deliberately unlike
 * all of them.
 *
 * AI-TRAP: these must be spelled out, never derived from `seed % n`. Two
 * earlier versions of this test generated them modularly and both were
 * worthless. The first made every song a rotation of one progression, so the
 * right answer beat the decoy 614 to 602 on identical audio. The second gave
 * the supposedly-unknown song the same key, chords and timbre as a library
 * entry and varied only the tempo — it scored 1551 and read as a false
 * positive, when what it actually described was a cover.
 *
 * That second failure is worth keeping in mind beyond the test: the
 * constellation keys off spectral content, so the genuinely hard case is one
 * performer's two songs in the same key with the same arrangement.
 */
const PIECES = [
  { key: 98.00,  shape: [0, 5, 3, 4],  bar: 1.20, partials: [1, 1.5, 2] },
  { key: 110.00, shape: [0, 3, 4, 0],  bar: 1.55, partials: [1, 2, 3, 4] },
  { key: 123.47, shape: [0, 4, 5, 3],  bar: 1.90, partials: [1, 1.5, 3] },
  { key: 130.81, shape: [0, 7, 5, 4],  bar: 2.25, partials: [1, 2, 2.5, 4] },
  { key: 146.83, shape: [0, 2, 4, 5],  bar: 2.60, partials: [1, 3, 4] },
  { key: 164.81, shape: [0, 5, 7, 0],  bar: 1.35, partials: [1, 1.5, 2, 3, 4] }
];

/** Shares no key, no chord degree beyond the root, no tempo and no timbre. */
const STRANGER = { key: 233.08, shape: [0, 10, 8, 6], bar: 3.10, partials: [1, 2.5, 5] };

function render(piece, seed, seconds = 20) {
  const rand = rng(seed * 7919 + 13);
  const out = new Float32Array(seconds * SAMPLE_RATE);
  const beat = piece.bar / 4;

  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const degree = piece.shape[Math.floor(t / piece.bar) % piece.shape.length];
    const f0 = piece.key * Math.pow(2, degree / 12);

    let v = 0;
    for (const ratio of piece.partials) v += Math.sin(2 * Math.PI * f0 * ratio * t) / (1 + ratio * 1.4);

    const since = t % beat;
    if (since < 0.02) v += rand() * 2.2 * (1 - since / 0.02);
    out[i] = v * 0.25;
  }
  return out;
}

const song = (n, seconds) => render(PIECES[n], n, seconds);

/** A phone microphone in a bad room: noise, treble eaten, level up, clipping. */
function throughARoom(clip, noise, seed) {
  const rand = rng(seed);
  const out = new Float32Array(clip.length);
  let prev = 0;

  for (let i = 0; i < clip.length; i++) {
    const v = prev + 0.55 * ((clip[i] * 0.6 + rand() * noise) - prev);
    prev = v;
    out[i] = Math.max(-0.9, Math.min(0.9, v * 1.8));
  }
  return out;
}

const index = (hashes) => {
  const m = new Map();
  for (const [h, t] of hashes) {
    const at = m.get(h);
    if (at) at.push(t); else m.set(h, [t]);
  }
  return m;
};

const LIBRARY = PIECES.map((_, n) => ({ id: 's' + n, index: index(fingerprint(song(n))) }));
/** What the endpoint does: score every candidate, then let the rule decide. */
const identify = (query) =>
  best(LIBRARY.map((l) => ({ id: l.id, ...align(query, l.index) })), query.length);
const excerpt = (seed, from, seconds) =>
  song(seed).slice(from * SAMPLE_RATE, (from + seconds) * SAMPLE_RATE);

describe('the fingerprint', () => {
  test('the same audio gives the same fingerprint', () => {
    // The browser and the server must agree exactly or nothing ever matches.
    assert.deepEqual(fingerprint(song(2)), fingerprint(song(2)));
  });

  test('silence contributes nothing', () => {
    assert.equal(peaks(new Float32Array(SAMPLE_RATE * 3)).length, 0);
  });

  test('the index is not empty', () => {
    assert.ok(LIBRARY[0].index.size > 1000, `premalo heseva: ${LIBRARY[0].index.size}`);
  });
});

describe('recognition', () => {
  test('a clean clip finds the right song', () => {
    assert.equal(identify(fingerprint(excerpt(3, 8, 6)))?.id, 's3');
  });

  test('six seconds survives noise louder than the music', () => {
    // 0.8 puts noise at roughly three times the amplitude of the music under it.
    for (const noise of [0.15, 0.4, 0.8]) {
      assert.equal(identify(fingerprint(throughARoom(excerpt(4, 7, 6), noise, 99)))?.id, 's4',
        `pao na sumu ${noise}`);
    }
  });

  test('a longer clip carries a bigger margin', () => {
    const short = identify(fingerprint(throughARoom(excerpt(1, 5, 6), 0.4, 7)));
    const long = identify(fingerprint(throughARoom(excerpt(1, 5, 10), 0.4, 7)));
    assert.equal(short?.id, 's1');
    assert.equal(long?.id, 's1');
    assert.ok(long.score > short.score, `${long.score} nije vece od ${short.score}`);
  });

  test('the rate does not grow with recording length', () => {
    // The bug the rate exists to prevent: a longer query must not score better
    // simply for being longer.
    const six = identify(fingerprint(excerpt(2, 4, 6)));
    const twelve = identify(fingerprint(excerpt(2, 4, 12)));
    assert.ok(Math.abs(six.rate - twelve.rate) < 0.15,
      `stopa se pomjerila s duzinom: ${six.rate} -> ${twelve.rate}`);
  });
});

describe('rejection', () => {
  /**
   * The runner-up ratio is what these rest on. Every case below ranks *some*
   * song first; the question is only whether the lead means anything.
   */
  test('three seconds through noise would rather not answer than guess', () => {
    assert.equal(identify(fingerprint(throughARoom(excerpt(4, 7, 3), 0.8, 99))), null);
  });

  test('noise that overpowers the music is refused, not guessed at', () => {
    assert.equal(identify(fingerprint(throughARoom(excerpt(4, 7, 6), 1.5, 99))), null);
  });

  test('a song outside the index gives no false match', () => {
    assert.equal(identify(fingerprint(render(STRANGER, 41))), null);
    assert.equal(identify(fingerprint(render(STRANGER, 41, 6))), null);
  });

  test('pure noise resembles nothing', () => {
    const noise = new Float32Array(SAMPLE_RATE * 6);
    const rand = rng(5);
    for (let i = 0; i < noise.length; i++) noise[i] = rand();
    assert.equal(identify(fingerprint(noise)), null);
  });

  test('the threshold is a rate, not a hit count', () => {
    // The same 500 hits: decisive in a short query, meaningless in a long one.
    const scored = [{ id: 'a', score: 500 }, { id: 'b', score: 10 }];
    assert.equal(best(scored, 2000)?.id, 'a');
    assert.equal(best(scored, 50000), null);
    assert.equal(best(scored, 0), null);
  });

  test('a narrow lead is not a match', () => {
    assert.equal(best([{ id: 'a', score: 300 }, { id: 'b', score: 250 }], 1000), null);
  });

  test('a rate below the threshold fails regardless of the lead', () => {
    const rate = MIN_RATE / 2;
    assert.equal(best([{ id: 'a', score: 1000 * rate }, { id: 'b', score: 1 }], 1000), null);
  });
});
