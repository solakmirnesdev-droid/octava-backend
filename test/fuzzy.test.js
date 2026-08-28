import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { damerau, budget, scoreMatch, SCORE } from '../src/utils/fuzzy.js';

describe('rastojanje', () => {
  test('zamjena mjesta je jedna greska, ne dvije', () => {
    // The whole reason for Damerau over Levenshtein: fingers land out of order
    // more often than they land on the wrong key twice.
    assert.equal(damerau('dugme', 'dugem'), 1);
    assert.equal(damerau('bembasu', 'bembsau'), 1);
  });

  test('osnovne izmjene', () => {
    assert.equal(damerau('dugme', 'dugme'), 0);
    assert.equal(damerau('dugme', 'dugne'), 1);   // substitution
    assert.equal(damerau('dugme', 'dugmee'), 1);  // insertion
    assert.equal(damerau('dugme', 'duge'), 1);    // deletion
  });

  test('granica se postuje i stedi rad', () => {
    // Past the budget the answer only has to be "too far", not how far.
    assert.ok(damerau('mrak', 'potpuno drugacije', 2) > 2);
    assert.equal(damerau('', 'mrak'), 4);
    assert.equal(damerau('mrak', ''), 4);
  });
});

describe('dozvoljene greske po duzini', () => {
  test('kratke rijeci se ne pogadjaju', () => {
    // "mrak" vs "brak" vs "zrak" are all one edit apart and all real words; a
    // budget here would turn the search into a random word generator.
    assert.equal(budget(3), 0);
    assert.equal(budget(2), 0);
  });

  test('duze rijeci dobijaju prostora', () => {
    assert.equal(budget(4), 1);
    assert.equal(budget(5), 1);
    assert.equal(budget(6), 2);
    assert.equal(budget(12), 2);
  });
});

describe('rangiranje', () => {
  test('tacan pogodak je iznad svega', () => {
    assert.equal(scoreMatch('emina', 'emina'), SCORE.EXACT);
  });

  test('poredak nivoa je strog', () => {
    const exact  = scoreMatch('mrak', 'mrak');
    const prefix = scoreMatch('mrak', 'mrak nad gradom');
    const word   = scoreMatch('mrak', 'pada mrakota');
    // Inside a word, not at the start of one — 'mrakove' would be a word
    // prefix and score the tier above.
    const has    = scoreMatch('mrak', 'u polumraku');
    assert.ok(exact > prefix, `${exact} > ${prefix}`);
    assert.ok(prefix > word, `${prefix} > ${word}`);
    assert.ok(word > has, `${word} > ${has}`);
    assert.ok(has > 0);
  });

  test('medju prefiksima kraci cilj pobjedjuje', () => {
    const tight = scoreMatch('mrak', 'mraku');
    const loose = scoreMatch('mrak', 'mrak nad gradom sarajevom');
    assert.ok(tight > loose, `${tight} > ${loose}`);
  });

  test('greska u kucanju i dalje nalazi', () => {
    // The case that motivated all of this.
    assert.ok(scoreMatch('bijelo dugne', 'bijelo dugme') > 0);
    assert.ok(scoreMatch('bijelo dugem', 'bijelo dugme') > 0);
  });

  test('pogresna rijec unutar dugog naslova', () => {
    // Whole-string distance here is nine; only per-word matching finds it.
    assert.ok(scoreMatch('dugne', 'bijelo dugme') > 0);
    assert.ok(scoreMatch('bembsau', 'kad ja podjoh na bembasu') > 0);
  });

  test('cist pogodak uvijek nadmasuje ispravljeni', () => {
    const clean = scoreMatch('dugme', 'bijelo dugme');
    const fixed = scoreMatch('dugne', 'bijelo dugme');
    assert.ok(clean > fixed, `${clean} > ${fixed}`);
  });

  test('vise gresaka rangira nize od jedne', () => {
    const one = scoreMatch('dugne', 'bijelo dugme');
    const two = scoreMatch('dugnw', 'bijelo dugme');
    assert.ok(one > two, `${one} > ${two}`);
  });

  test('nepovezan upit ne prolazi', () => {
    assert.equal(scoreMatch('helikopter', 'bijelo dugme'), 0);
    assert.equal(scoreMatch('xyz', 'emina'), 0);
    assert.equal(scoreMatch('', 'emina'), 0);
  });

  test('sve rijeci upita moraju negdje sletjeti', () => {
    // "bijelo" lands, "helikopter" does not, so the whole query fails.
    assert.equal(scoreMatch('bijelo helikopter', 'bijelo dugme'), 0);
  });
});

describe('skracena rijec', () => {
  test('ispusteno slovo u kratkoj rijeci se i dalje nalazi', () => {
    // "hri" is three characters and would get no budget of its own, but it is
    // reaching for the four-character "hari".
    assert.ok(scoreMatch('hari mata hri', 'hari mata hari') > 0);
    assert.ok(scoreMatch('hri', 'hari mata hari') > 0);
  });

  test('to ne otvara vrata bilo cemu', () => {
    assert.equal(scoreMatch('xyz', 'hari mata hari'), 0);
    assert.equal(scoreMatch('bijelo helikopter', 'bijelo dugme'), 0);
  });
});
