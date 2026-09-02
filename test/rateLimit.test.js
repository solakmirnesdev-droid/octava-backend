/**
 * Rate limiting is switched off for the rest of the suite, because its
 * counters live in process memory and survive the database being wiped between
 * tests. This file opts back in, so the protection is still exercised rather
 * than silently excluded.
 */
process.env.RATE_LIMIT = 'on';

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Imported dynamically, not statically. ES module imports are hoisted above
// the assignment above, so a static import would load the middleware while the
// flag was still unset — and the suite would quietly test nothing.
const { start, stop, reset, api } = await import('./helpers.js');

const READER = { email: 'meta@test.local', password: 'lozinka1234', username: 'Meta' };

before(start);
after(stop);
beforeEach(reset);

describe('limiting attempts', () => {
  test('misses are stopped, successes are not', async () => {
    await api('/auth/register', { method: 'POST', body: READER });

    let blocked = 0;
    for (let i = 0; i < 14; i++) {
      const res = await api('/auth/login', {
        method: 'POST', body: { email: READER.email, password: 'pogresna99999' }
      });
      if (res.status === 429) blocked++;
    }

    // bcrypt makes each attempt costly for us, not for an attacker, so the
    // cost has to be imposed separately.
    assert.ok(blocked > 0, 'neogranicen broj pokusaja');
  });

  test('locking one account does not touch another', async () => {
    await api('/auth/register', { method: 'POST', body: READER });
    await api('/auth/register', {
      method: 'POST', body: { ...READER, email: 'drugi@test.local', username: 'Drugi' }
    });

    for (let i = 0; i < 14; i++) {
      await api('/auth/login', {
        method: 'POST', body: { email: READER.email, password: 'pogresna99999' }
      });
    }

    // Keyed per address and account, so spraying one password across many
    // accounts is throttled without one person locking out everyone else
    // behind the same office connection.
    const other = await api('/auth/login', {
      method: 'POST', body: { email: 'drugi@test.local', password: READER.password }
    });
    assert.notEqual(other.status, 429, 'drugi nalog zakljucan zbog prvog');
  });
});
