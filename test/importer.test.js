import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { convertToChordPro, guessKey } from '../src/utils/importer.js';

describe('import from "chords above lyrics"', () => {
  test('a chord attaches to the word beneath it', () => {
    //          column 0          column 11
    //          v                 v
    const input = 'Am         F\nprvi drugi treci cetvrti';
    assert.equal(convertToChordPro(input).content, '[Am]prvi drugi [F]treci cetvrti');
  });

  test('a chord over a space belongs to the word that follows', () => {
    // Column 16 is the gap after 'treci', not the word itself. A chord printed
    // over a gap belongs to what comes next, never trailing what came before.
    const input = 'Am              F\nprvi drugi treci cetvrti';
    assert.equal(convertToChordPro(input).content, '[Am]prvi drugi treci [F]cetvrti');
  });

  test('a chord does not cut a word in half', () => {
    // Songbook alignment is approximate; a chord printed two characters into a
    // word belongs at that word's start, not splitting it.
    const input = 'Am        F\nprvi drugi treci';
    const out = convertToChordPro(input).content;
    assert.ok(!/[a-z]\[/.test(out), `akord unutar rijeci: ${out}`);
  });

  test('a chord on whitespace goes to the following word', () => {
    const input = 'C          G\njedan dva tri cetiri';
    const out = convertToChordPro(input).content;
    assert.ok(!/ \[/.test(out.replace(/^\[/, '')) || /\[G\]\w/.test(out), out);
  });

  test('section labels are recognized', () => {
    assert.match(convertToChordPro('Refren:\nAm\ntekst').content, /^\[Refren\]/);
    assert.match(convertToChordPro('Solo:\nAm  F').content, /^\[Solo\]/);
  });

  test('an instrumental row with no lyrics stays on its own', () => {
    const out = convertToChordPro('Uvod:\nAm  F  C  G').content;
    assert.equal(out, '[Uvod]\n[Am]  [F]  [C]  [G]');
  });

  test('tabs are expanded before columns are mapped', () => {
    // A tab left unexpanded shifts every column after it.
    const out = convertToChordPro('Am\tF\nprvi drugi treci').content;
    assert.ok(out.includes('[Am]'), out);
  });

  test('lyrics with no chords raise a warning', () => {
    const result = convertToChordPro('samo tekst\nbez akorada');
    assert.equal(result.chords.length, 0);
    assert.equal(result.warnings.length, 1);
  });

  test('empty input does not crash', () => {
    assert.deepEqual(convertToChordPro(''), { content: '', chords: [], warnings: [] });
    assert.deepEqual(convertToChordPro(null), { content: '', chords: [], warnings: [] });
  });
});

describe('guessing the key', () => {
  test('looks at the last chord', () => {
    // Songs overwhelmingly resolve to their tonic.
    assert.equal(guessKey('[C]a [F]b [G]c [Am]d'), 'Am');
    assert.equal(guessKey('[F]a [G]b [C]c'), 'C');
  });

  test('with no chords it returns null', () => {
    assert.equal(guessKey('samo tekst'), null);
    assert.equal(guessKey(''), null);
  });
});
