import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Staff, Rating;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: Rating } = await import('../src/models/Rating.js'));
});
after(stop);
beforeEach(reset);

async function setup() {
  await Staff.create({
    email: 'radnik@test.local', name: 'Radnik', role: 'worker',
    passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const staff = await api('/auth/staff/login', {
    method: 'POST', body: { email: 'radnik@test.local', password: 'lozinka1234' }
  });
  const token = staff.body.token;

  const created = await api('/songs', {
    method: 'POST', token,
    body: {
      title: 'Sa verzijama', artist: 'Neko', content: '[Am]osnovni tekst',
      originalKey: 'Am', status: 'published'
    }
  });
  return { token, slug: created.body.song.slug };
}

const addOne = (slug, token, body) =>
  api(`/songs/${slug}/arrangements`, { method: 'POST', token, body });

describe('verzije pjesme', () => {
  test('nova pjesma pocinje sa jednom verzijom koja je glavna', async () => {
    const { slug } = await setup();
    const res = await api(`/songs/${slug}`);
    assert.equal(res.body.song.arrangements.length, 1);
    assert.equal(res.body.song.arrangements[0].isPrimary, true);
  });

  test('dodana verzija ne preuzima glavnu ulogu', async () => {
    const { slug, token } = await setup();
    await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });

    const res = await api(`/songs/${slug}`);
    const primary = res.body.song.arrangements.find((a) => a.isPrimary);
    assert.equal(res.body.song.arrangements.length, 2);
    assert.equal(primary.label, 'Osnovna verzija', 'glavna se ne smije promijeniti sama');
  });

  test('bez izbora se cita glavna, sa izborom trazena', async () => {
    const { slug, token } = await setup();
    const added = await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });
    const second = added.body.song.arrangements.find((a) => !a.isPrimary);

    const def = await api(`/songs/${slug}`);
    assert.equal(def.body.song.content, '[Am]osnovni tekst');

    const picked = await api(`/songs/${slug}?arrangement=${second._id}`);
    assert.equal(picked.body.song.content, '[C]lakše');
    assert.equal(picked.body.song.originalKey, 'C');
  });

  test('nepostojeci izbor pada nazad na glavnu umjesto da puca', async () => {
    const { slug } = await setup();
    const res = await api(`/songs/${slug}?arrangement=000000000000000000000000`);
    assert.equal(res.status, 200);
    assert.equal(res.body.song.content, '[Am]osnovni tekst');
  });

  test('tekst i tonalitet su obavezni', async () => {
    const { slug, token } = await setup();
    const res = await addOne(slug, token, { label: 'Bez teksta' });
    assert.equal(res.status, 400);
  });

  test('promjena glavne ostavlja tacno jednu glavnu', async () => {
    const { slug, token } = await setup();
    const added = await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });
    const second = added.body.song.arrangements.find((a) => !a.isPrimary);

    const res = await api(`/songs/${slug}/arrangements/${second._id}/primary`, {
      method: 'PATCH', token
    });
    assert.equal(res.status, 200);
    const flagged = res.body.song.arrangements.filter((a) => a.isPrimary);
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].label, 'Lakša');
  });

  test('brisanje glavne promovise drugu', async () => {
    const { slug, token } = await setup();
    const added = await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });
    const primary = added.body.song.arrangements.find((a) => a.isPrimary);

    const res = await api(`/songs/${slug}/arrangements/${primary._id}`, { method: 'DELETE', token });
    assert.equal(res.status, 200);
    assert.equal(res.body.song.arrangements.length, 1);
    assert.equal(res.body.song.arrangements[0].isPrimary, true,
      'bez ovoga glavna ostaje nepostavljena i redoslijed odlucuje');
  });

  test('posljednja verzija se ne moze obrisati', async () => {
    const { slug, token } = await setup();
    const only = (await api(`/songs/${slug}`)).body.song.arrangements[0];

    const res = await api(`/songs/${slug}/arrangements/${only._id}`, { method: 'DELETE', token });
    assert.equal(res.status, 409);
  });

  test('brisanje verzije brise i njene glasove', async () => {
    const { slug, token } = await setup();
    const added = await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });
    const second = added.body.song.arrangements.find((a) => !a.isPrimary);

    const reader = await api('/auth/register', {
      method: 'POST',
      body: { email: 'citalac@test.local', password: 'lozinka1234', username: 'Citalac' }
    });
    await api(`/songs/${slug}/rating`, {
      method: 'POST', token: reader.body.token, body: { value: 5, arrangementId: second._id }
    });
    assert.equal(await Rating.countDocuments({ arrangement: second._id }), 1);

    await api(`/songs/${slug}/arrangements/${second._id}`, { method: 'DELETE', token });
    assert.equal(await Rating.countDocuments({ arrangement: second._id }), 0,
      'glasovi za obrisanu verziju nemaju znacenje');
  });

  test('ocjene se vode odvojeno po verziji', async () => {
    const { slug, token } = await setup();
    const added = await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });
    const primary = added.body.song.arrangements.find((a) => a.isPrimary);
    const second = added.body.song.arrangements.find((a) => !a.isPrimary);

    const reader = await api('/auth/register', {
      method: 'POST',
      body: { email: 'citalac@test.local', password: 'lozinka1234', username: 'Citalac' }
    });
    await api(`/songs/${slug}/rating`, {
      method: 'POST', token: reader.body.token, body: { value: 5, arrangementId: primary._id }
    });
    await api(`/songs/${slug}/rating`, {
      method: 'POST', token: reader.body.token, body: { value: 1, arrangementId: second._id }
    });

    const res = await api(`/songs/${slug}`);
    const byId = Object.fromEntries(res.body.song.arrangements.map((a) => [String(a._id), a]));
    assert.equal(byId[String(primary._id)].rating, 5);
    assert.equal(byId[String(second._id)].rating, 1);
  });

  test('radnik moze, citalac ne moze', async () => {
    const { slug } = await setup();
    const reader = await api('/auth/register', {
      method: 'POST',
      body: { email: 'citalac@test.local', password: 'lozinka1234', username: 'Citalac' }
    });
    const res = await api(`/songs/${slug}/arrangements`, {
      method: 'POST', token: reader.body.token,
      body: { content: '[C]nesto', originalKey: 'C' }
    });
    assert.ok(res.status === 401 || res.status === 403, `ocekivano 401/403, dobijeno ${res.status}`);
  });
});
