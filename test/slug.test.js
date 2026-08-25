import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/utils/slug.js';

describe('slugovi', () => {
  test('d s crtom ne nestaje', () => {
    // NFD normalisation strips combining accents but leaves d-stroke intact,
    // because it is a distinct letter rather than a base plus a mark. Without
    // an explicit map this slugs to 'urevdan'.
    assert.equal(slugify('Đurđevdan'), 'djurdjevdan');
    assert.equal(slugify('Đorđe Balašević'), 'djordje-balasevic');
  });

  test('ostali dijakritici se presavijaju', () => {
    assert.equal(slugify('Čardaš'), 'cardas');
    assert.equal(slugify('Što te nema'), 'sto-te-nema');
    assert.equal(slugify('Ćiribiribela'), 'ciribiribela');
    assert.equal(slugify('Žuta ruža'), 'zuta-ruza');
  });

  test('interpunkcija i razmaci', () => {
    assert.equal(slugify('  Dvije   rijeci  '), 'dvije-rijeci');
    assert.equal(slugify('Ne pitaj me, ne!'), 'ne-pitaj-me-ne');
    assert.equal(slugify('A/B & C'), 'a-b-c');
  });

  test('prazan i besmislen ulaz', () => {
    assert.equal(slugify(''), '');
    assert.equal(slugify(null), '');
    assert.equal(slugify('!!!'), '');
  });

  test('duzina je ogranicena', () => {
    assert.ok(slugify('a'.repeat(200)).length <= 90);
  });

  test('nikad ne pocinje ni ne zavrsava crticom', () => {
    for (const input of ['---abc---', '  abc  ', '!abc!']) {
      const out = slugify(input);
      assert.ok(!out.startsWith('-') && !out.endsWith('-'), `lose: "${out}"`);
    }
  });
});
