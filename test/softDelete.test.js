import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Staff, Song, Artist, Genre, AuditLog;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: Song } = await import('../src/models/Song.js'));
  ({ default: Artist } = await import('../src/models/Artist.js'));
  ({ default: Genre } = await import('../src/models/Genre.js'));
  ({ default: AuditLog } = await import('../src/models/AuditLog.js'));
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

const makeSong = (token, title, extra = {}) =>
  api('/songs', {
    method: 'POST', token,
    body: {
      title, artist: 'Neko', content: '[Am]tekst',
      originalKey: 'Am', status: 'published', ...extra
    }
  });

describe('trashing', () => {
  test('a trashed song disappears from the public listing and detail page', async () => {
    const admin = await login('admin');
    const { body } = await makeSong(admin, 'Za brisanje');
    const { slug } = body.song;

    assert.equal((await api(`/songs/${slug}`)).status, 200);

    const del = await api(`/songs/${slug}`, { method: 'DELETE', token: admin });
    assert.equal(del.status, 200);

    assert.equal((await api(`/songs/${slug}`)).status, 404);
    const list = await api('/songs');
    assert.equal(list.body.songs.some((s) => s.slug === slug), false);
  });

  test('the document still exists, it is only marked', async () => {
    const admin = await login('admin');
    const { body } = await makeSong(admin, 'Jos tu');
    await api(`/songs/${body.song.slug}`, { method: 'DELETE', token: admin });

    assert.equal(await Song.countDocuments(), 0);
    const raw = await Song.findOne({ _id: body.song._id }).setOptions({ withDeleted: true });
    assert.ok(raw, 'dokument je stvarno obrisan iz baze');
    assert.ok(raw.deletedAt instanceof Date);
    assert.ok(raw.deletedBy);
  });

  test('it is found in the trash and restored', async () => {
    const admin = await login('admin');
    const { body } = await makeSong(admin, 'Povratnik');
    const { slug } = body.song;
    await api(`/songs/${slug}`, { method: 'DELETE', token: admin });

    const trash = await api('/songs/trash', { token: admin });
    assert.equal(trash.status, 200);
    assert.equal(trash.body.songs.length, 1);
    assert.equal(trash.body.songs[0].slug, slug);

    const back = await api(`/songs/${slug}/restore`, { method: 'POST', token: admin });
    assert.equal(back.status, 200);
    assert.equal((await api(`/songs/${slug}`)).status, 200);
    assert.equal((await api('/songs/trash', { token: admin })).body.songs.length, 0);
  });

  test('artist counters follow trashing and restoring', async () => {
    const admin = await login('admin');
    const { body } = await makeSong(admin, 'Brojac');
    const { slug, artist } = body.song;
    const artistId = artist._id || artist;

    assert.equal((await Artist.findById(artistId)).songCount, 1);
    await api(`/songs/${slug}`, { method: 'DELETE', token: admin });
    assert.equal((await Artist.findById(artistId)).songCount, 0);
    await api(`/songs/${slug}/restore`, { method: 'POST', token: admin });
    assert.equal((await Artist.findById(artistId)).songCount, 1);
  });

  test('the stats do not count trashed rows', async () => {
    const admin = await login('admin');
    await makeSong(admin, 'Ostaje');
    const { body } = await makeSong(admin, 'Odlazi');
    await api(`/songs/${body.song.slug}`, { method: 'DELETE', token: admin });

    const stats = await api('/stats/overview', { token: admin });
    assert.equal(stats.body.published, 1, 'agregacija broji obrisanu pjesmu');
    assert.equal(stats.body.songs, 1);
  });
});

describe('permanent removal', () => {
  test('requires the song to be in the trash first', async () => {
    const root = await login('superadmin');
    const { body } = await makeSong(root, 'Ziva');

    const res = await api(`/songs/${body.song.slug}/purge`, { method: 'DELETE', token: root });
    assert.equal(res.status, 409);
    assert.ok(await Song.findById(body.song._id));
  });

  test('an admin may not, a superadmin may', async () => {
    const admin = await login('admin');
    const root = await login('superadmin');
    const { body } = await makeSong(admin, 'Za uklanjanje');
    const { slug } = body.song;
    await api(`/songs/${slug}`, { method: 'DELETE', token: admin });

    assert.equal((await api(`/songs/${slug}/purge`, { method: 'DELETE', token: admin })).status, 403);

    const gone = await api(`/songs/${slug}/purge`, { method: 'DELETE', token: root });
    assert.equal(gone.status, 200);
    assert.equal(await Song.countDocuments().setOptions({ withDeleted: true }), 0);
  });
});

describe('audit log', () => {
  test('records trashing and restoring, with the song name', async () => {
    const admin = await login('admin');
    const { body } = await makeSong(admin, 'Pod nadzorom');
    const { slug } = body.song;

    await api(`/songs/${slug}`, { method: 'DELETE', token: admin });
    await api(`/songs/${slug}/restore`, { method: 'POST', token: admin });

    const log = await api('/audit?entity=song', { token: admin });
    const actions = log.body.entries.map((e) => e.action);
    assert.ok(actions.includes('create'));
    assert.ok(actions.includes('delete'));
    assert.ok(actions.includes('restore'));

    const entry = log.body.entries.find((e) => e.action === 'delete');
    assert.equal(entry.entityLabel, 'Pod nadzorom');
    assert.equal(entry.actorName, 'admin');
  });

  test('izmjena biljezi staru i novu vrijednost', async () => {
    const admin = await login('admin');
    const { body } = await makeSong(admin, 'Stari naslov');

    await api(`/songs/${body.song.slug}`, {
      method: 'PUT', token: admin, body: { title: 'Novi naslov', status: 'draft' }
    });

    const log = await api('/audit?action=update', { token: admin });
    const changes = log.body.entries[0].changes;
    const title = changes.find((c) => c.field === 'title');
    assert.equal(title.from, 'Stari naslov');
    assert.equal(title.to, 'Novi naslov');
    assert.ok(changes.find((c) => c.field === 'status' && c.to === 'draft'));
  });

  test('the song name survives permanent removal', async () => {
    const root = await login('superadmin');
    const { body } = await makeSong(root, 'Nestala zauvijek');
    const { slug } = body.song;
    await api(`/songs/${slug}`, { method: 'DELETE', token: root });
    await api(`/songs/${slug}/purge`, { method: 'DELETE', token: root });

    const log = await api('/audit?action=purge', { token: root });
    assert.equal(log.body.entries[0].entityLabel, 'Nestala zauvijek');
  });

  test('a worker does not see the audit trail', async () => {
    const worker = await login('worker');
    assert.equal((await api('/audit', { token: worker })).status, 403);
  });
});

describe('bulk edits', () => {
  test('changes status on several songs at once', async () => {
    const worker = await login('worker');
    const a = await makeSong(worker, 'Prva');
    const b = await makeSong(worker, 'Druga');

    const res = await api('/songs/bulk', {
      method: 'POST', token: worker,
      body: { ids: [a.body.song._id, b.body.song._id], action: 'status', value: 'draft' }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.touched, 2);
    assert.equal(await Song.countDocuments({ status: 'draft' }), 2);
  });

  test('adding a genre does not inflate the counter when repeated', async () => {
    const worker = await login('worker');
    const genre = await Genre.create({ name: 'Rok', slug: 'rok', kind: 'style' });
    const a = await makeSong(worker, 'Jedna');

    const body = { ids: [a.body.song._id], action: 'addGenre', value: 'rok' };
    const first = await api('/songs/bulk', { method: 'POST', token: worker, body });
    const second = await api('/songs/bulk', { method: 'POST', token: worker, body });

    assert.equal(first.body.touched, 1);
    assert.equal(second.body.touched, 0, 'druga primjena ne smije nista promijeniti');
    assert.equal((await Genre.findById(genre._id)).songCount, 1);
  });

  test('a bulk delete sends to the trash, it does not destroy', async () => {
    const admin = await login('admin');
    const a = await makeSong(admin, 'Grupno A');
    const b = await makeSong(admin, 'Grupno B');

    await api('/songs/bulk', {
      method: 'POST', token: admin,
      body: { ids: [a.body.song._id, b.body.song._id], action: 'delete' }
    });

    assert.equal(await Song.countDocuments(), 0);
    assert.equal(await Song.countDocuments().setOptions({ withDeleted: true }), 2);
  });

  test('refuses an unknown action and an empty list', async () => {
    const worker = await login('worker');
    const a = await makeSong(worker, 'Nesto');

    assert.equal((await api('/songs/bulk', {
      method: 'POST', token: worker, body: { ids: [a.body.song._id], action: 'izbrisi-sve' }
    })).status, 400);

    assert.equal((await api('/songs/bulk', {
      method: 'POST', token: worker, body: { ids: [], action: 'status', value: 'draft' }
    })).status, 400);
  });

  test('is recorded as a single entry with a count', async () => {
    const admin = await login('admin');
    const a = await makeSong(admin, 'X');
    const b = await makeSong(admin, 'Y');

    await api('/songs/bulk', {
      method: 'POST', token: admin,
      body: { ids: [a.body.song._id, b.body.song._id], action: 'status', value: 'draft' }
    });

    const log = await api('/audit?action=bulk', { token: admin });
    assert.equal(log.body.entries.length, 1);
    assert.equal(log.body.entries[0].meta.touched, 2);
    assert.equal(log.body.entries[0].meta.operation, 'status');
  });
});
