import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Staff, Artist;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: Artist } = await import('../src/models/Artist.js'));
});
after(stop);
beforeEach(reset);

async function login(role) {
  const email = `${role}@test.local`;
  await Staff.create({
    email, name: role, role,
    passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email, password: 'lozinka1234' }
  });
  return res.body.token;
}

const makeArtist = (token, name, extra = {}) =>
  api('/artists', { method: 'POST', token, body: { name, ...extra } });

describe('izvodjac u korpu', () => {
  test('obrisan izvodjac nestaje sa javnog spiska', async () => {
    const token = await login('superadmin');
    const { body } = await makeArtist(token, 'Za brisanje', { country: 'BA' });

    let list = await api('/artists');
    assert.ok(list.body.artists.some((a) => a.slug === body.artist.slug));

    assert.equal((await api(`/artists/${body.artist._id}`, { method: 'DELETE', token })).status, 200);

    list = await api('/artists');
    assert.equal(list.body.artists.filter((a) => a.slug === body.artist.slug).length, 0);
  });

  test('nestaje i iz slova i iz spiska drzava', async () => {
    // Aggregations bypass the scoping hook, so this is the case that breaks
    // silently: the artist is gone from the list but their initial and their
    // country still light up the filters, offering a facet that returns nobody.
    const token = await login('superadmin');
    const { body } = await makeArtist(token, 'Zeleni', { country: 'BA' });

    let list = await api('/artists');
    assert.ok(list.body.letters.includes('Z'));
    assert.ok(list.body.countries.some((c) => c.code === 'BA'));

    await api(`/artists/${body.artist._id}`, { method: 'DELETE', token });

    list = await api('/artists');
    assert.ok(!list.body.letters.includes('Z'));
    assert.ok(!list.body.countries.some((c) => c.code === 'BA'));
  });

  test('korpa ga pokazuje, vracanje ga vraca', async () => {
    const token = await login('superadmin');
    const { body } = await makeArtist(token, 'Vrati me');
    await api(`/artists/${body.artist._id}`, { method: 'DELETE', token });

    const trash = await api('/artists/trash', { token });
    assert.equal(trash.status, 200);
    assert.equal(trash.body.artists.length, 1);
    assert.equal(trash.body.artists[0].name, 'Vrati me');

    const back = await api(`/artists/${body.artist._id}/restore`, { method: 'POST', token });
    assert.equal(back.status, 200);

    const list = await api('/artists');
    assert.ok(list.body.artists.some((a) => a.name === 'Vrati me'));
    assert.equal((await api('/artists/trash', { token })).body.artists.length, 0);
  });

  test('ponovno dodavanje pjesme ozivljava obrisanog, ne pada na duplom slugu', async () => {
    // The trap this whole design turns on: `slug` is a unique index, so the
    // deleted row still owns theirs. Scoped to living artists the lookup finds
    // nothing, calls create(), and collides — a 500 on adding a song.
    const token = await login('superadmin');
    const { body } = await makeArtist(token, 'Povratnik');
    await api(`/artists/${body.artist._id}`, { method: 'DELETE', token });

    const song = await api('/songs', {
      method: 'POST', token,
      body: {
        title: 'Nova', artist: 'Povratnik', content: '[Am]tekst',
        originalKey: 'Am', status: 'published'
      }
    });

    assert.equal(song.status, 201, JSON.stringify(song.body));
    assert.equal(song.body.song.artist.name, 'Povratnik');

    // Revived rather than duplicated: still one artist, and it is the same one.
    const all = await Artist.find({ name: 'Povratnik' }).setOptions({ withDeleted: true });
    assert.equal(all.length, 1);
    assert.equal(all[0].deletedAt, null);
    assert.equal(String(all[0]._id), String(body.artist._id));
  });

  test('trajno uklanjanje trazi da je prvo obrisan', async () => {
    const token = await login('superadmin');
    const { body } = await makeArtist(token, 'Zivi');

    const early = await api(`/artists/${body.artist._id}/purge`, { method: 'DELETE', token });
    assert.equal(early.status, 409);

    await api(`/artists/${body.artist._id}`, { method: 'DELETE', token });
    assert.equal((await api(`/artists/${body.artist._id}/purge`, { method: 'DELETE', token })).status, 200);

    const gone = await Artist.find({ name: 'Zivi' }).setOptions({ withDeleted: true });
    assert.equal(gone.length, 0);
  });

  test('izvodjac s pjesmama se ne brise', async () => {
    const token = await login('superadmin');
    await api('/songs', {
      method: 'POST', token,
      body: {
        title: 'Ima pjesmu', artist: 'Zauzet', content: '[Am]tekst',
        originalKey: 'Am', status: 'published'
      }
    });
    const found = await Artist.findOne({ name: 'Zauzet' });

    const res = await api(`/artists/${found._id}`, { method: 'DELETE', token });
    assert.equal(res.status, 409);
  });

  test('korpa i vracanje traze admina', async () => {
    const worker = await login('worker');
    assert.equal((await api('/artists/trash', { token: worker })).status, 403);
  });
});
