import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from '../src/middleware/sanitize.js';

/** Runs the middleware over a fake request and hands back what survived. */
function run({ body, query, params } = {}) {
  const req = { body, query, params };
  let called = false;
  sanitize(req, {}, () => { called = true; });
  assert.ok(called, 'next() nije pozvan');
  return req;
}

describe('ciscenje operatora', () => {
  test('operator u tijelu nestaje, ostatak ostaje', () => {
    const req = run({ body: { email: { $ne: null }, password: 'tajna' } });
    assert.deepEqual(req.body, { email: {}, password: 'tajna' });
  });

  test('svi uobicajeni operatori', () => {
    const req = run({ body: { a: { $gt: '' }, b: { $regex: '.*' }, c: { $where: '1==1' } } });
    assert.deepEqual(req.body, { a: {}, b: {}, c: {} });
  });

  test('tacka u kljucu takodje — dotirani put zalazi u poddokument', () => {
    const req = run({ body: { 'user.role': 'admin', ime: 'Meho' } });
    assert.deepEqual(req.body, { ime: 'Meho' });
  });

  test('zagadjenje prototipa', () => {
    // Arrives in the same shape as an operator and deserves its own stop.
    const req = run({ body: JSON.parse('{"__proto__":{"admin":true},"ime":"Meho"}') });
    assert.deepEqual(Object.keys(req.body), ['ime']);
    assert.equal({}.admin, undefined, 'prototip je zagadjen');
  });

  test('ugnijezdjeno se cisti do kraja', () => {
    const req = run({ body: { filter: { nested: { $ne: 1 }, ok: 2 } } });
    assert.deepEqual(req.body, { filter: { nested: {}, ok: 2 } });
  });

  test('nizovi se obilaze', () => {
    const req = run({ body: { ids: [{ $ne: null }, 'abc'] } });
    assert.deepEqual(req.body, { ids: [{}, 'abc'] });
  });

  test('obican zahtjev prolazi netaknut', () => {
    const body = { title: 'Emina', year: 1974, tags: ['sevdah'], nested: { a: 1 } };
    assert.deepEqual(run({ body: structuredClone(body) }).body, body);
  });

  test('query i params takodje', () => {
    const req = run({ query: { status: { $ne: 'published' } }, params: { $where: 'x', id: '5' } });
    assert.deepEqual(req.query, { status: {} });
    assert.deepEqual(req.params, { id: '5' });
  });

  test('prazan zahtjev ne pada', () => {
    assert.doesNotThrow(() => run({}));
  });

  test('duboko ugnijezdjeno ne obara proces', () => {
    // Cheap to send, expensive to walk: the depth limit is what stops it.
    let deep = { $ne: 1 };
    for (let i = 0; i < 500; i++) deep = { nested: deep };
    assert.doesNotThrow(() => run({ body: deep }));
  });
});
