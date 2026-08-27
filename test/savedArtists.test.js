import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Artist, User, Song, Staff;

before(async () => {
  await start();
  ({ default: Artist } = await import('../src/models/Artist.js'));
  ({ default: User } = await import('../src/models/User.js'));
  ({ default: Song } = await import('../src/models/Song.js'));
  ({ default: Staff } = await import('../src/models/Staff.js'));
});
after(stop);
beforeEach(reset);

async function reader() {
  const res = await api('/auth/register', {
    method: 'POST',
    body: { email: 'citalac@test.local', password: 'lozinka1234', username: 'Citalac' }
  });
  return res.body.token;
}

describe('sacuvani izvodjaci', () => {
  test('spasavanje i uklanjanje', async () => {
    const token = await reader();
    const artist = await Artist.create({ name: 'Neko', slug: 'neko' });

    assert.equal((await api('/me/artists', { token })).body.artists.length, 0);

    const saved = await api(`/me/artists/${artist._id}`, { method: 'POST', token });
    assert.equal(saved.status, 200);

    const list = await api('/me/artists', { token });
    assert.equal(list.body.artists.length, 1);
    assert.equal(list.body.artists[0].name, 'Neko');
    assert.equal((await Artist.findById(artist._id)).favoriteCount, 1);

    await api(`/me/artists/${artist._id}`, { method: 'DELETE', token });
    assert.equal((await api('/me/artists', { token })).body.artists.length, 0);
    assert.equal((await Artist.findById(artist._id)).favoriteCount, 0);
  });

  test('dvostruko spasavanje ne naduva brojac', async () => {
    const token = await reader();
    const artist = await Artist.create({ name: 'Dvaput', slug: 'dvaput' });

    await api(`/me/artists/${artist._id}`, { method: 'POST', token });
    await api(`/me/artists/${artist._id}`, { method: 'POST', token });

    assert.equal((await api('/me/artists', { token })).body.artists.length, 1);
    assert.equal((await Artist.findById(artist._id)).favoriteCount, 1, 'brojac je naduvan');
  });

  test('brojac ne pada ispod nule', async () => {
    const token = await reader();
    const artist = await Artist.create({ name: 'Nula', slug: 'nula' });

    // Removing something that was never saved must be a no-op, not a decrement.
    await api(`/me/artists/${artist._id}`, { method: 'DELETE', token });
    assert.equal((await Artist.findById(artist._id)).favoriteCount, 0);
  });

  test('nepostojeci izvodjac se odbija', async () => {
    const token = await reader();
    const res = await api('/me/artists/6a8cdb4bf1c8dba32c0bb647', { method: 'POST', token });
    assert.equal(res.status, 404);
    assert.equal((await User.findOne()).favoriteArtists.length, 0);
  });

  test('trazi prijavu', async () => {
    const artist = await Artist.create({ name: 'Zakljucan', slug: 'zakljucan' });
    assert.equal((await api(`/me/artists/${artist._id}`, { method: 'POST' })).status, 401);
    assert.equal((await api('/me/artists')).status, 401);
  });

  test('sacuvane pjesme i izvodjaci se ne mijesaju', async () => {
    const token = await reader();
    const artist = await Artist.create({ name: 'Odvojeno', slug: 'odvojeno' });
    await api(`/me/artists/${artist._id}`, { method: 'POST', token });

    // The song list must not pick up an artist id, and the other way round.
    assert.equal((await api('/me/favorites', { token })).body.songs.length, 0);
    assert.equal((await api('/me/artists', { token })).body.artists.length, 1);
  });
});

describe('sacuvane pjesme', () => {
  async function aSong() {
    await Staff.create({
      email: 'radnik@test.local', name: 'Radnik', role: 'worker',
      passwordHash: await Staff.hashPassword('lozinka1234')
    });
    const staff = await api('/auth/staff/login', {
      method: 'POST', body: { email: 'radnik@test.local', password: 'lozinka1234' }
    });
    const res = await api('/songs', {
      method: 'POST', token: staff.body.token,
      body: { title: 'Pjesma', artist: 'Neko', content: '[Am]a', originalKey: 'Am', status: 'published' }
    });
    return res.body.song._id;
  }

  test('dvostruko spasavanje ne naduva brojac', async () => {
    const token = await reader();
    const id = await aSong();

    await api(`/me/favorites/${id}`, { method: 'POST', token });
    await api(`/me/favorites/${id}`, { method: 'POST', token });

    /*
     * AI-NOTE: this failed before the filter carried the test. The schema has
     * timestamps, so every update writes updatedAt and modifiedCount is 1 even
     * when the array is untouched — the counter drifted away from the thing it
     * counts while the saved list stayed correct.
     */
    assert.equal((await Song.findById(id)).favoriteCount, 1, 'brojac je naduvan');
    assert.equal((await api('/me/favorites', { token })).body.songs.length, 1);
  });

  test('dvostruko uklanjanje ne obara brojac ispod nule', async () => {
    const token = await reader();
    const id = await aSong();

    await api(`/me/favorites/${id}`, { method: 'POST', token });
    await api(`/me/favorites/${id}`, { method: 'DELETE', token });
    await api(`/me/favorites/${id}`, { method: 'DELETE', token });

    assert.equal((await Song.findById(id)).favoriteCount, 0);
  });
});
