import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Staff, User, Review, Artist;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: User } = await import('../src/models/User.js'));
  ({ default: Review } = await import('../src/models/Review.js'));
  ({ default: Artist } = await import('../src/models/Artist.js'));
});
after(stop);
beforeEach(reset);

async function login(role, email = `${role}@test.local`) {
  await Staff.create({
    email, name: role, role,
    passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email, password: 'lozinka1234' }
  });
  return res.body.token;
}

/** Every entry for one entity, newest first. */
async function trail(token, params = '') {
  const res = await api(`/audit${params}`, { token });
  return res.body.entries || [];
}

describe('trag: izvodjaci', () => {
  test('dodavanje, izmjena i brisanje ostavljaju zapis', async () => {
    const token = await login('admin');

    const made = await api('/artists', {
      method: 'POST', token, body: { name: 'Probni Izvođač', country: 'BA' }
    });
    assert.equal(made.status, 201);
    const id = made.body.artist._id;

    await api(`/artists/${id}`, { method: 'PUT', token, body: { name: 'Preimenovani', country: 'HR' } });
    await api(`/artists/${id}`, { method: 'DELETE', token });

    const entries = await trail(token, '?entity=artist');
    const actions = entries.map((e) => e.action);
    assert.ok(actions.includes('create'), 'dodavanje nije zabiljezeno');
    assert.ok(actions.includes('update'), 'izmjena nije zabiljezena');
    assert.ok(actions.includes('delete'), 'brisanje nije zabiljezeno');
  });

  test('izmjena nosi staru i novu vrijednost', async () => {
    const token = await login('admin');
    const made = await api('/artists', { method: 'POST', token, body: { name: 'Prvo Ime', country: 'BA' } });

    await api(`/artists/${made.body.artist._id}`, {
      method: 'PUT', token, body: { name: 'Drugo Ime', country: 'RS' }
    });

    const [entry] = await trail(token, '?entity=artist&action=update');
    const name = entry.changes.find((c) => c.field === 'name');
    assert.equal(name.from, 'Prvo Ime');
    assert.equal(name.to, 'Drugo Ime');
    assert.ok(entry.changes.find((c) => c.field === 'country' && c.to === 'RS'));
  });

  test('ime izvodjaca prezivi brisanje', async () => {
    const token = await login('admin');
    const made = await api('/artists', { method: 'POST', token, body: { name: 'Nestali' } });
    await api(`/artists/${made.body.artist._id}`, { method: 'DELETE', token });

    const [entry] = await trail(token, '?entity=artist&action=delete');
    assert.equal(entry.entityLabel, 'Nestali');
    assert.equal(await Artist.countDocuments(), 0);
  });
});

describe('trag: nalozi', () => {
  test('promjena uloge biljezi ko, kome i sa cega na sta', async () => {
    const root = await login('superadmin');
    const worker = await Staff.findOne({ email: 'worker@test.local' })
      || await Staff.create({
        email: 'worker@test.local', name: 'Radnik', role: 'worker',
        passwordHash: await Staff.hashPassword('lozinka1234')
      });

    const res = await api(`/accounts/staff/${worker._id}`, {
      method: 'PATCH', token: root, body: { role: 'admin' }
    });
    assert.equal(res.status, 200);

    const [entry] = await trail(root, '?entity=staff');
    assert.equal(entry.action, 'update');
    assert.equal(entry.entityLabel, 'worker@test.local');
    assert.equal(entry.actorName, 'superadmin');
    const role = entry.changes.find((c) => c.field === 'role');
    assert.equal(role.from, 'worker');
    assert.equal(role.to, 'admin');
  });

  test('deaktivacija se biljezi', async () => {
    const root = await login('superadmin');
    const worker = await Staff.create({
      email: 'drugi@test.local', name: 'Drugi', role: 'worker',
      passwordHash: await Staff.hashPassword('lozinka1234')
    });

    await api(`/accounts/staff/${worker._id}`, { method: 'PATCH', token: root, body: { active: false } });

    const [entry] = await trail(root, '?entity=staff');
    assert.ok(entry.changes.find((c) => c.field === 'active' && c.to === false));
  });
});

describe('trag: moderacija', () => {
  async function aReview(token) {
    const song = await api('/songs', {
      method: 'POST', token,
      body: { title: 'Za recenziju', artist: 'Neko', content: '[Am]a', originalKey: 'Am', status: 'published' }
    });

    const reader = await api('/auth/register', {
      method: 'POST',
      body: { email: 'citalac@test.local', password: 'lozinka1234', username: 'Citalac' }
    });
    await api(`/songs/${song.body.song.slug}/reviews`, {
      method: 'POST', token: reader.body.token, body: { rating: 4, body: 'Dobri akordi, hvala.' }
    });

    return Review.findOne();
  }

  test('sakrivanje biljezi razlog', async () => {
    const token = await login('admin');
    const review = await aReview(token);

    const res = await api(`/moderation/reviews/${review._id}`, {
      method: 'PATCH', token, body: { hidden: true, reason: 'uvredljivo' }
    });
    assert.equal(res.status, 200);

    const [entry] = await trail(token, '?action=hide');
    assert.equal(entry.entity, 'review');
    assert.equal(entry.meta.reason, 'uvredljivo');
    assert.ok(entry.entityLabel.startsWith('Dobri akordi'), 'zapis ne kaze sta je sakriveno');
  });

  test('otkrivanje se biljezi kao zasebna radnja', async () => {
    const token = await login('admin');
    const review = await aReview(token);

    await api(`/moderation/reviews/${review._id}`, {
      method: 'PATCH', token, body: { hidden: true, reason: 'greška' }
    });
    await api(`/moderation/reviews/${review._id}`, { method: 'PATCH', token, body: { hidden: false } });

    const actions = (await trail(token)).map((e) => e.action);
    assert.ok(actions.includes('hide'));
    assert.ok(actions.includes('unhide'));
  });
});

describe('trag: verzije pjesama', () => {
  test('brisanje i vracanje verzije ostavljaju zapis sa imenom pjesme', async () => {
    const token = await login('admin');
    const song = await api('/songs', {
      method: 'POST', token,
      body: { title: 'Sa verzijama', artist: 'Neko', content: '[Am]a', originalKey: 'Am' }
    });
    const slug = song.body.song.slug;

    const added = await api(`/songs/${slug}/arrangements`, {
      method: 'POST', token, body: { label: 'Lakša', content: '[C]b', originalKey: 'C' }
    });
    const second = added.body.song.arrangements.find((a) => !a.isPrimary);

    await api(`/songs/${slug}/arrangements/${second._id}`, { method: 'DELETE', token });
    await api(`/songs/${slug}/arrangements/${second._id}/restore`, { method: 'POST', token });

    const entries = await trail(token, '?entity=arrangement');
    const actions = entries.map((e) => e.action);
    assert.ok(actions.includes('delete'));
    assert.ok(actions.includes('restore'));
    assert.ok(entries[0].entityLabel.includes('Sa verzijama'), 'zapis ne kaze kojoj pjesmi pripada');
  });
});
