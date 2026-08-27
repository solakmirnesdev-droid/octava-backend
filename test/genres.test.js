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

describe('rubrike', () => {
  test('prazna rubrika se ne nudi u navigaciji', async () => {
    await Genre.create({ name: 'Puna', slug: 'puna', kind: 'region', songCount: 5 });
    await Genre.create({ name: 'Prazna', slug: 'prazna', kind: 'region', songCount: 0 });

    const res = await api('/genres');
    const names = res.body.genres.map((g) => g.name);

    // AI-NOTE: an empty rubric in the navigation is a promise the site cannot
    // keep — every visitor who tried it got an empty page.
    assert.ok(names.includes('Puna'));
    assert.equal(names.includes('Prazna'), false, 'prazna rubrika se i dalje nudi');
  });

  test('vraca se sama cim dobije pjesmu', async () => {
    const genre = await Genre.create({ name: 'Kasnija', slug: 'kasnija', kind: 'style', songCount: 0 });
    assert.equal((await api('/genres')).body.genres.length, 0);

    await Genre.updateOne({ _id: genre._id }, { songCount: 1 });
    assert.equal((await api('/genres')).body.genres.length, 1);
  });

  test('grupisanje po vrsti i dalje radi', async () => {
    await Genre.create({ name: 'Domaća', slug: 'domaca', kind: 'region', songCount: 3 });
    await Genre.create({ name: 'Rock', slug: 'rock', kind: 'style', songCount: 7 });

    const { grouped } = (await api('/genres')).body;
    assert.equal(grouped.region.length, 1);
    assert.equal(grouped.style.length, 1);
  });
});
