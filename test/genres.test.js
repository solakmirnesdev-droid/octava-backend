import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Genre, Staff;

before(async () => {
  await start();
  ({ default: Genre } = await import('../src/models/Genre.js'));
  ({ default: Staff } = await import('../src/models/Staff.js'));
});
after(stop);
beforeEach(reset);

describe('sections', () => {
  test('an empty section is not offered in navigation', async () => {
    await Genre.create({ name: 'Puna', slug: 'puna', kind: 'region', songCount: 5 });
    await Genre.create({ name: 'Prazna', slug: 'prazna', kind: 'region', songCount: 0 });

    const res = await api('/genres');
    const names = res.body.genres.map((g) => g.name);

    // AI-NOTE: an empty rubric in the navigation is a promise the site cannot
    // keep — every visitor who tried it got an empty page.
    assert.ok(names.includes('Puna'));
    assert.equal(names.includes('Prazna'), false, 'prazna rubrika se i dalje nudi');
  });

  test('it comes back on its own as soon as it gets a song', async () => {
    const genre = await Genre.create({ name: 'Kasnija', slug: 'kasnija', kind: 'style', songCount: 0 });
    assert.equal((await api('/genres')).body.genres.length, 0);

    await Genre.updateOne({ _id: genre._id }, { songCount: 1 });
    assert.equal((await api('/genres')).body.genres.length, 1);
  });

  test('grouping by kind still works', async () => {
    await Genre.create({ name: 'Domaća', slug: 'domaca', kind: 'region', songCount: 3 });
    await Genre.create({ name: 'Rock', slug: 'rock', kind: 'style', songCount: 7 });

    const { grouped } = (await api('/genres')).body;
    assert.equal(grouped.region.length, 1);
    assert.equal(grouped.style.length, 1);
  });
});

describe('filter by tag', () => {
  test('returns only songs with that tag', async () => {
    const Staff = (await import('../src/models/Staff.js')).default;
    await Staff.create({
      email: 'radnik@test.local', name: 'Radnik', role: 'worker',
      passwordHash: await Staff.hashPassword('lozinka1234')
    });
    const login = await api('/auth/staff/login', {
      method: 'POST', body: { email: 'radnik@test.local', password: 'lozinka1234' }
    });
    const token = login.body.token;

    const make = (title, tags) => api('/songs', {
      method: 'POST', token,
      body: { title, artist: 'Neko', content: '[Am]a', originalKey: 'Am', status: 'published', tags }
    });
    await make('Sa oznakom', ['bez-akorda']);
    await make('Bez oznake', []);

    const all = await api('/songs?status=all', { token });
    assert.equal(all.body.songs.length, 2);

    const tagged = await api('/songs?status=all&tag=bez-akorda', { token });
    assert.equal(tagged.body.songs.length, 1);
    assert.equal(tagged.body.songs[0].title, 'Sa oznakom');
  });

  test('an unknown tag returns empty, not everything', async () => {
    const res = await api('/songs?tag=nepostojeci');
    assert.equal(res.body.songs.length, 0);
  });
});
