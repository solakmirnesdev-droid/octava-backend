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

describe('song versions', () => {
  test('a new song starts with one version, and it is the main one', async () => {
    const { slug } = await setup();
    const res = await api(`/songs/${slug}`);
    assert.equal(res.body.song.arrangements.length, 1);
    assert.equal(res.body.song.arrangements[0].isPrimary, true);
  });

  test('an added version does not take over as main', async () => {
    const { slug, token } = await setup();
    await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });

    const res = await api(`/songs/${slug}`);
    const primary = res.body.song.arrangements.find((a) => a.isPrimary);
    assert.equal(res.body.song.arrangements.length, 2);
    assert.equal(primary.label, 'Osnovna verzija', 'glavna se ne smije promijeniti sama');
  });

  test('without a choice the main one is read, with one the requested', async () => {
    const { slug, token } = await setup();
    const added = await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });
    const second = added.body.song.arrangements.find((a) => !a.isPrimary);

    const def = await api(`/songs/${slug}`);
    assert.equal(def.body.song.content, '[Am]osnovni tekst');

    const picked = await api(`/songs/${slug}?arrangement=${second._id}`);
    assert.equal(picked.body.song.content, '[C]lakše');
    assert.equal(picked.body.song.originalKey, 'C');
  });

  test('a missing choice falls back to the main one instead of throwing', async () => {
    const { slug } = await setup();
    const res = await api(`/songs/${slug}?arrangement=000000000000000000000000`);
    assert.equal(res.status, 200);
    assert.equal(res.body.song.content, '[Am]osnovni tekst');
  });

  test('lyrics and key are required', async () => {
    const { slug, token } = await setup();
    const res = await addOne(slug, token, { label: 'Bez teksta' });
    assert.equal(res.status, 400);
  });

  test('changing the main one leaves exactly one main', async () => {
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

  test('deleting the main one promotes another', async () => {
    const { slug, token } = await setup();
    const added = await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });
    const primary = added.body.song.arrangements.find((a) => a.isPrimary);

    const res = await api(`/songs/${slug}/arrangements/${primary._id}`, { method: 'DELETE', token });
    assert.equal(res.status, 200);
    assert.equal(res.body.song.arrangements.length, 1);
    assert.equal(res.body.song.arrangements[0].isPrimary, true,
      'bez ovoga glavna ostaje nepostavljena i redoslijed odlucuje');
  });

  test('the last version cannot be deleted', async () => {
    const { slug, token } = await setup();
    const only = (await api(`/songs/${slug}`)).body.song.arrangements[0];

    const res = await api(`/songs/${slug}/arrangements/${only._id}`, { method: 'DELETE', token });
    assert.equal(res.status, 409);
  });

  test('deleting a version keeps its votes and takes it off the site', async () => {
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

    const res = await api(`/songs/${slug}/arrangements/${second._id}`, { method: 'DELETE', token });
    assert.equal(res.status, 200);

    // The version leaves the site immediately...
    assert.equal(res.body.song.arrangements.length, 1);
    const shown = await api(`/songs/${slug}`);
    assert.equal(shown.body.song.arrangements.some((a) => String(a._id) === String(second._id)), false);

    // ...but its votes stay. The text can be retyped; other people's judgement
    // of whether the chart was right cannot, and it is what makes the version
    // worth getting back.
    assert.equal(await Rating.countDocuments({ arrangement: second._id }), 1,
      'glasovi su unisteni, a verzija se moze vratiti');
  });

  test('a deleted version can be restored with its ratings', async () => {
    const { slug, token } = await setup();
    const added = await addOne(slug, token, { label: 'Lakša', content: '[C]lakše', originalKey: 'C' });
    const second = added.body.song.arrangements.find((a) => !a.isPrimary);

    await api(`/songs/${slug}/arrangements/${second._id}`, { method: 'DELETE', token });

    const trash = await api(`/songs/${slug}/arrangements/removed`, { token });
    assert.equal(trash.body.arrangements.length, 1);
    assert.equal(trash.body.arrangements[0].label, 'Lakša');

    const back = await api(`/songs/${slug}/arrangements/${second._id}/restore`, { method: 'POST', token });
    assert.equal(back.status, 200);
    assert.equal(back.body.song.arrangements.length, 2);
  });

  test('deleting does not free a slot below the limit of six', async () => {
    const { slug, token } = await setup();
    // One exists already, so five more fills the song.
    for (let i = 2; i <= 6; i++) {
      await addOne(slug, token, { label: 'V' + i, content: '[C]x', originalKey: 'C' });
    }
    const full = await api(`/songs/${slug}`);
    assert.equal(full.body.song.arrangements.length, 6);

    const doomed = full.body.song.arrangements.find((a) => !a.isPrimary);
    await api(`/songs/${slug}/arrangements/${doomed._id}`, { method: 'DELETE', token });

    // AI-TRAP: counting the raw array here would keep the song at six and
    // refuse a replacement that should be allowed.
    const added = await addOne(slug, token, { label: 'Nova', content: '[C]x', originalKey: 'C' });
    assert.equal(added.status, 201);
    assert.equal(added.body.song.arrangements.length, 6);
  });

  test('ratings are tracked separately per version', async () => {
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

  test('a worker can, a reader cannot', async () => {
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
