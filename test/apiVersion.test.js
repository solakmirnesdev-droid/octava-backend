import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

before(start);
after(stop);
beforeEach(reset);

/**
 * The versioned path is a promise to clients that cannot be updated.
 *
 * AI-NOTE: this suite exists so the promise cannot be broken by accident. The
 * failure it guards against is mundane — somebody mounts a new route on `app`
 * instead of on the `api` router, it works perfectly on the website, and it is
 * simply absent from every phone. Nothing would notice; the site would be fine.
 */
describe('verzija API-ja', () => {
  test('/api/v1 odgovara isto sto i /api', async () => {
    const paths = ['/songs?limit=1', '/artists?limit=1', '/genres', '/plans', '/footer', '/version'];

    for (const path of paths) {
      const plain = await api(path);
      const pinned = await api(`/v1${path}`);
      assert.equal(pinned.status, plain.status, `status se razlikuje na ${path}`);
      assert.deepEqual(
        Object.keys(pinned.body).sort(), Object.keys(plain.body).sort(),
        `oblik odgovora se razlikuje na ${path}`
      );
    }
  });

  test('svaka montirana ruta postoji i pod v1', async () => {
    // Reaching one path but not the other is the exact mistake this guards.
    const resources = [
      'songs', 'artists', 'genres', 'plans', 'stats', 'footer',
      'requests', 'recognize', 'version', 'auth/me', 'me/favorites'
    ];

    for (const r of resources) {
      const plain = await api(`/${r}`);
      const pinned = await api(`/v1/${r}`);
      assert.notEqual(pinned.status, 404, `/${r} nedostaje pod /api/v1`);
      assert.equal(
        pinned.status, plain.status,
        `/${r} se ponasa razlicito pod v1 (${pinned.status}) i bez verzije (${plain.status})`
      );
    }
  });

  test('version kaze koja je verzija i sta trazi od klijenta', async () => {
    const res = await api('/v1/version');
    assert.equal(res.status, 200);
    assert.equal(res.body.api, 'v1');
    // Present even when unset: a client checking for the key must not have to
    // tell "no minimum" apart from "old server that does not answer this".
    assert.ok('minimumClient' in res.body);
    assert.ok('notice' in res.body);
  });

  test('nepoznata verzija je 404, ne tiho preusmjerenje', async () => {
    // A client asking for v2 must be told plainly, not quietly handed v1.
    assert.equal((await api('/v2/songs')).status, 404);
  });
});
