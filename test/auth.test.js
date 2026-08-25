import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

const READER = { email: 'citalac@test.local', password: 'lozinka1234', username: 'Citalac' };
const EDITOR = { email: 'urednik@test.local', password: 'lozinka1234', name: 'Urednik' };

let Staff;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
});
after(stop);
beforeEach(reset);

async function makeReader() {
  const res = await api('/auth/register', { method: 'POST', body: READER });
  return res.body.token;
}

async function makeEditor(role = 'worker') {
  await Staff.create({
    email: EDITOR.email,
    name: EDITOR.name,
    role,
    passwordHash: await Staff.hashPassword(EDITOR.password)
  });
  const res = await api('/auth/staff/login', {
    method: 'POST',
    body: { email: EDITOR.email, password: EDITOR.password }
  });
  return res.body.token;
}

/**
 * The failure this guards against is silent. A token accepted by the wrong
 * realm throws nothing and logs nothing — it simply lets someone in, and the
 * only symptom is a reader holding editorial powers.
 */
describe('razdvajanje naloga', () => {
  test('registracija na sajtu ne pravi urednika', async () => {
    await makeReader();
    // The account must not exist in the editorial collection at all.
    assert.equal(await Staff.countDocuments({ email: READER.email }), 0);

    const res = await api('/auth/staff/login', {
      method: 'POST',
      body: { email: READER.email, password: READER.password }
    });
    assert.equal(res.status, 401);
  });

  test('registracija ne moze zatraziti rolu', async () => {
    await api('/auth/register', {
      method: 'POST',
      body: { ...READER, role: 'admin', email: 'napadac@test.local' }
    });
    assert.equal(await Staff.countDocuments({}), 0);
  });

  test('citalacki token ne prolazi kroz urednicke rute', async () => {
    const token = await makeReader();

    for (const [path, options] of [
      ['/auth/staff/me', {}],
      ['/songs', { method: 'POST', body: { title: 'x', artist: 'y', content: '[Am]z', originalKey: 'Am' } }],
      ['/stats/overview', {}],
      ['/import/preview', { method: 'POST', body: { text: 'Am\ntekst' } }]
    ]) {
      const res = await api(path, { ...options, token });
      assert.ok(res.status === 401 || res.status === 403, `${path} vratio ${res.status}`);
    }
  });

  test('urednicki token ne prolazi kroz citalacke rute', async () => {
    const token = await makeEditor();

    for (const path of ['/auth/me', '/me/favorites']) {
      const res = await api(path, { token });
      assert.equal(res.status, 401, `${path} vratio ${res.status}`);
    }
  });

  test('urednik i dalje moze uredjivati', async () => {
    const token = await makeEditor();
    const res = await api('/songs', {
      method: 'POST',
      token,
      body: { title: 'Testna', artist: 'Neko', content: '[Am]tekst', originalKey: 'Am' }
    });
    assert.equal(res.status, 201);
  });

  test('isti email moze postojati u oba svijeta bez preklapanja', async () => {
    // A person may be both a reader and an editor; the accounts stay separate.
    await Staff.create({
      email: READER.email, name: 'Isti', role: 'worker',
      passwordHash: await Staff.hashPassword('drugalozinka99')
    });
    const readerToken = await makeReader();

    const res = await api('/auth/staff/me', { token: readerToken });
    assert.equal(res.status, 401, 'citalacki token otvorio urednicki nalog istog emaila');
  });
});

describe('prijava', () => {
  test('pogresna lozinka i nepostojeci email daju istu poruku', async () => {
    await makeReader();

    const wrong = await api('/auth/login', {
      method: 'POST', body: { email: READER.email, password: 'pogresna99999' }
    });
    const missing = await api('/auth/login', {
      method: 'POST', body: { email: 'nema@test.local', password: 'bilosta99999' }
    });

    // Differing messages would let anyone enumerate which addresses exist.
    assert.equal(wrong.status, missing.status);
    assert.equal(wrong.body.message, missing.body.message);
  });

  test('lozinka se ne vraca ni u jednom odgovoru', async () => {
    const res = await api('/auth/register', { method: 'POST', body: READER });
    const serialised = JSON.stringify(res.body);
    assert.ok(!serialised.includes('passwordHash'), 'hash u odgovoru');
    assert.ok(!serialised.includes(READER.password), 'lozinka u odgovoru');
  });

  test('kratka lozinka se odbija', async () => {
    const res = await api('/auth/register', {
      method: 'POST', body: { ...READER, password: 'kratka' }
    });
    assert.equal(res.status, 400);
  });

  test('sesija stize kao httpOnly kolacic', async () => {
    const res = await api('/auth/register', { method: 'POST', body: READER });
    const cookie = res.setCookie.find((c) => c.startsWith('octava_session'));
    assert.ok(cookie, 'nema kolacica sesije');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });
});

describe('vidljivost skica', () => {
  test('posjetilac ne vidi neobjavljeno', async () => {
    const token = await makeEditor();
    await api('/songs', {
      method: 'POST', token,
      body: { title: 'Skica', artist: 'Neko', content: '[Am]x', originalKey: 'Am', status: 'draft' }
    });

    const anon = await api('/songs?status=draft');
    assert.equal(anon.body.songs.length, 0, 'skica procurila posjetiocu');

    const staff = await api('/songs?status=draft', { token });
    assert.equal(staff.body.songs.length, 1);
  });
});
