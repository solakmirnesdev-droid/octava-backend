import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  transposeContent, transposeChord, transposeKey,
  extractChords, isChord, normalizeNotation
} from '../src/utils/chords.js';

/**
 * The chord engine fails quietly: a wrong spelling still renders, still
 * transposes, and still looks like a chord. Nobody notices until a guitarist
 * does, which is the worst possible reviewer to be surprised by.
 */
describe('notation', () => {
  test('the twelfth degree is H, not B', () => {
    assert.equal(transposeKey('C', 11), 'H');
    assert.equal(transposeContent('[Am]a', 2, 'Am'), '[Hm]a');
  });

  test('it never writes flats', () => {
    for (let n = -11; n <= 11; n++) {
      const out = transposeContent('[Am]a [F]b [C]c [G]d', n, 'Am');
      assert.ok(!/\[[A-H]b/.test(out), `snizilica u izlazu za pomak ${n}: ${out}`);
    }
  });

  test('it reads both systems on input', () => {
    // Imported charts use B for the twelfth degree and Bb for its flat; both
    // have to land on the right pitch or every American source imports wrong.
    assert.equal(transposeContent('[H]a', 1), '[C]a');
    assert.equal(transposeContent('[B]a', 1), '[C]a');
    assert.equal(transposeContent('[Bb]a', 1), '[H]a');
    assert.equal(transposeContent('[Eb]a', 1), '[E]a');
  });

  test('normalization rewrites whatever spelling it finds', () => {
    assert.equal(normalizeNotation('[G/B]a'), '[G/H]a');
    assert.equal(normalizeNotation('[Bb]a [Eb]b'), '[A#]a [D#]b');
    assert.equal(normalizeNotation('[Bm]a'), '[Hm]a');
  });
});

describe('transposition', () => {
  test('it wraps around after an octave', () => {
    const song = '[Am]a [F]b [C]c [G/H]d';
    assert.equal(transposeContent(song, 12, 'Am'), song);
  });

  test('+7 and -5 give the same', () => {
    // The interval wraps at twelve, which is why the picker offers twelve
    // destinations rather than a wider range of steps.
    assert.equal(
      transposeContent('[Am]a [F]b', 7, 'Am'),
      transposeContent('[Am]a [F]b', -5, 'Am')
    );
  });

  test('the bass in a slash chord follows the root', () => {
    assert.equal(transposeContent('[G/H]a', 2, 'Am'), '[A/C#]a');
  });

  test('an extended quality stays untouched', () => {
    assert.equal(transposeContent('[F#m7b5]a', 1, 'Am'), '[Gm7b5]a');
    assert.equal(transposeContent('[Csus4]a [Dadd9]b', 2, 'C'), '[Dsus4]a [Eadd9]b');
  });
});

describe('section labels', () => {
  test('are not chords', () => {
    // [Chorus] parses as C plus the suffix 'horus' unless the suffix is
    // validated, and would transpose into [Dhorus].
    for (const marker of ['Chorus', 'Bridge', 'Coda', 'Fine', 'Refren', 'Solo']) {
      assert.equal(isChord(marker), false, `${marker} prepoznat kao akord`);
    }
  });

  test('survive transposition unchanged', () => {
    assert.equal(transposeContent('[Refren] [Am]a', 2, 'Am'), '[Refren] [Hm]a');
    assert.equal(transposeContent('[Coda][Fine]', 2, 'C'), '[Coda][Fine]');
    assert.equal(transposeContent('[x2] [G]a', 2, 'G'), '[x2] [A]a');
  });

  test('do not enter the chord list', () => {
    assert.deepEqual(extractChords('[Refren][Am][F][Am]'), ['Am', 'F']);
  });
});

describe('edge cases', () => {
  test('empty and nonsense input does not crash', () => {
    assert.equal(transposeContent('', 2, 'Am'), '');
    assert.equal(transposeContent(null, 2, 'Am'), null);
    assert.equal(transposeChord('', 2), '');
    assert.deepEqual(extractChords(''), []);
  });

  test('an unknown key returns the input', () => {
    assert.equal(transposeKey('Xyz', 2), 'Xyz');
  });
});
