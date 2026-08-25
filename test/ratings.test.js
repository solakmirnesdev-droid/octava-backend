import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Staff, Song;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: Song } = await import('../src/models/Song.js'));
});
after(stop);
beforeEach(reset);

/** A published song plus however many signed-in readers the test needs. */
async function setup(readers = 1) {
  await Staff.create({
    email: 'urednik@test.local', name: 'Urednik', role: 'worker',
    passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const editor = await api('/auth/staff/login', {
    method: 'POST', body: { email: 'urednik@test.local', password: 'lozinka1234' }
  });

  const created = await api('/songs', {
    method: 'POST', token: editor.body.token,
    body: {
      title: 'Ocijenjena', artist: 'Neko', content: '[Am]tekst',
      originalKey: 'Am', status: 'published'
    }
  });

  const tokens = [];
  for (let i = 0; i < readers; i++) {
    const res = await api('/auth/register', {
      method: 'POST',
      body: { email: `citalac${i}@test.local`, password: 'lozinka1234', username: `Citalac${i}` }
    });
    tokens.push(res.body.token);
  }

  return { slug: created.body.song.slug, tokens };
}

describe('ocjenjivanje', () => {
  test('prva ocjena postavlja prosjek', async () => {
    const { slug, tokens } = await setup(1);

    const res = await api(`/songs/${slug}/rating`, {
      method: 'POST', token: tokens[0], body: { value: 4 }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.rating.average, 4);
    assert.equal(res.body.rating.count, 1);
    assert.equal(res.body.rating.mine, 4);
  });

  test('prosjek vise glasova', async () => {
    const { slug, tokens } = await setup(3);
    for (const [i, value] of [5, 4, 3].entries()) {
      await api(`/songs/${slug}/rating`, { method: 'POST', token: tokens[i], body: { value } });
    }

    const res = await api(`/songs/${slug}/rating`);
    assert.equal(res.body.rating.count, 3);
    assert.equal(res.body.rating.average, 4);
  });

  test('promjena ocjene pomjera zbir, ne broj glasova', async () => {
    const { slug, tokens } = await setup(2);
    await api(`/songs/${slug}/rating`, { method: 'POST', token: tokens[0], body: { value: 2 } });
    await api(`/songs/${slug}/rating`, { method: 'POST', token: tokens[1], body: { value: 4 } });

    // Recasting must move the sum by the difference alone. Adding the new value
    // without subtracting the old is the classic way this drifts upward.
    const res = await api(`/songs/${slug}/rating`, {
      method: 'POST', token: tokens[0], body: { value: 5 }
    });

    assert.equal(res.body.rating.count, 2, 'broj glasova se promijenio');
    assert.equal(res.body.rating.average, 4.5);
  });

  test('povlacenje ocjene vraca oboje', async () => {
    const { slug, tokens } = await setup(2);
    await api(`/songs/${slug}/rating`, { method: 'POST', token: tokens[0], body: { value: 5 } });
    await api(`/songs/${slug}/rating`, { method: 'POST', token: tokens[1], body: { value: 1 } });

    const res = await api(`/songs/${slug}/rating`, { method: 'DELETE', token: tokens[1] });
    assert.equal(res.body.rating.count, 1);
    assert.equal(res.body.rating.average, 5);
    assert.equal(res.body.rating.mine, null);
  });

  test('brojevi se ne mogu spustiti ispod nule', async () => {
    const { slug, tokens } = await setup(1);
    await api(`/songs/${slug}/rating`, { method: 'POST', token: tokens[0], body: { value: 3 } });
    await api(`/songs/${slug}/rating`, { method: 'DELETE', token: tokens[0] });

    const second = await api(`/songs/${slug}/rating`, { method: 'DELETE', token: tokens[0] });
    assert.equal(second.status, 404);

    const res = await api(`/songs/${slug}/rating`);
    assert.equal(res.body.rating.count, 0);
    assert.equal(res.body.rating.average, 0);
  });
});

describe('sta se odbija', () => {
  test('glasanje trazi nalog', async () => {
    const { slug } = await setup(0);
    const res = await api(`/songs/${slug}/rating`, { method: 'POST', body: { value: 5 } });
    assert.equal(res.status, 401);
  });

  test('prosjek je javan', async () => {
    const { slug } = await setup(0);
    const res = await api(`/songs/${slug}/rating`);
    assert.equal(res.status, 200);
    assert.equal(res.body.rating.mine, null);
  });

  test('vrijednosti izvan opsega', async () => {
    const { slug, tokens } = await setup(1);
    for (const value of [0, 6, -1, 2.5, 'pet', null]) {
      const res = await api(`/songs/${slug}/rating`, {
        method: 'POST', token: tokens[0], body: { value }
      });
      assert.equal(res.status, 400, `prihvacena ocjena ${value}`);
    }
  });

  test('jedan glas po citaocu, koliko god puta poslao', async () => {
    const { slug, tokens } = await setup(1);
    for (let i = 0; i < 5; i++) {
      await api(`/songs/${slug}/rating`, { method: 'POST', token: tokens[0], body: { value: 5 } });
    }

    const res = await api(`/songs/${slug}/rating`);
    assert.equal(res.body.rating.count, 1, 'jedan citalac napuhao broj glasova');
  });
});
