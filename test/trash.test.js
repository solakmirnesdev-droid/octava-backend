import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { start, stop, reset, api } from './helpers.js';

/**
 * Emptying the trash is the one action in the tool that cannot be undone, and
 * the ways it can go wrong are all quiet: a song purged while its ratings stay
 * behind, an artist purged out from under songs that were only soft-deleted,
 * an admin reaching a superadmin's button. None of those throw.
 */

let Song, Artist, Staff, Rating, Review, ReviewComment, SongReport, Notification, AudioPrint;

before(async () => {
  await start();
  ({ default: Song } = await import('../src/models/Song.js'));
  ({ default: Artist } = await import('../src/models/Artist.js'));
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: Rating } = await import('../src/models/Rating.js'));
  ({ default: Review } = await import('../src/models/Review.js'));
  ({ default: ReviewComment } = await import('../src/models/ReviewComment.js'));
  ({ default: SongReport } = await import('../src/models/SongReport.js'));
  ({ default: Notification } = await import('../src/models/Notification.js'));
  ({ default: AudioPrint } = await import('../src/models/AudioPrint.js'));
});
after(stop);
beforeEach(reset);

async function signIn(role) {
  const email = `${role}@test.local`;
  await Staff.create({
    email, name: role, role, passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email, password: 'lozinka1234' }
  });
  return res.body.token;
}

async function makeSong(title, artist, { deleted = false } = {}) {
  const song = await Song.create({
    title, artist: artist._id, status: 'published',
    arrangements: [{ content: '[Am]a', originalKey: 'Am', isPrimary: true }]
  });
  if (deleted) await Song.updateOne({ _id: song._id }, { deletedAt: new Date() });
  return song;
}

const bury = (artist) => Artist.updateOne({ _id: artist._id }, { deletedAt: new Date() });

describe('access rights', () => {
  test('no emptying without signing in', async () => {
    assert.equal((await api('/trash', { method: 'DELETE' })).status, 401);
  });

  test('an admin cannot empty the trash', async () => {
    // Purging one song is superadmin; doing three hundred is not a smaller act.
    const token = await signIn('admin');
    assert.equal((await api('/trash', { method: 'DELETE', token })).status, 403);
  });

  test('a superadmin can', async () => {
    const token = await signIn('superadmin');
    assert.equal((await api('/trash', { method: 'DELETE', token })).status, 200);
  });
});

describe('emptying', () => {
  test('deletes what was trashed and leaves the living', async () => {
    const token = await signIn('superadmin');
    const artist = await Artist.findOrCreateByName('Testni');
    await makeSong('Ziva', artist);
    await makeSong('Obrisana', artist, { deleted: true });

    const res = await api('/trash', { method: 'DELETE', token });
    assert.equal(res.body.songs, 1);

    const left = await Song.find().setOptions({ withDeleted: true });
    assert.deepEqual(left.map((s) => s.title), ['Ziva']);
  });

  test('ratings go with the song', async () => {
    const token = await signIn('superadmin');
    const artist = await Artist.findOrCreateByName('Testni');
    const song = await makeSong('Obrisana', artist, { deleted: true });

    await Rating.create({
      song: song._id,
      arrangement: song.arrangements[0]._id,
      user: new mongoose.Types.ObjectId(),
      value: 5
    });

    const res = await api('/trash', { method: 'DELETE', token });
    assert.equal(res.body.removed.ratings, 1);
    assert.equal(await Rating.countDocuments(), 0);
  });

  test('an empty trash does not blow up', async () => {
    const token = await signIn('superadmin');
    const res = await api('/trash', { method: 'DELETE', token });
    assert.equal(res.body.songs, 0);
    assert.equal(res.body.artists, 0);
  });
});

describe('orphans', () => {
  /**
   * AI-TRAP: the whole reason songs are purged before artists. An artist whose
   * catalogue is entirely in the trash counts zero living songs, so the
   * single-artist guard waves them through — and the trashed songs are left
   * pointing at an id that no longer resolves.
   */
  test('an artist and their trashed songs go together, songs first', async () => {
    const token = await signIn('superadmin');
    const artist = await Artist.findOrCreateByName('Odlazi');
    await makeSong('Njegova', artist, { deleted: true });
    await bury(artist);

    const res = await api('/trash', { method: 'DELETE', token });
    assert.equal(res.body.songs, 1);
    assert.equal(res.body.artists, 1);
    assert.equal(await Song.countDocuments().setOptions({ withDeleted: true }), 0);
    assert.equal(await Artist.countDocuments().setOptions({ withDeleted: true }), 0);
  });

  test('a trashed artist with a living song stays', async () => {
    const token = await signIn('superadmin');
    const artist = await Artist.findOrCreateByName('Ostaje');
    await makeSong('Ziva', artist);
    await bury(artist);

    const res = await api('/trash', { method: 'DELETE', token });
    assert.equal(res.body.artists, 0);
    assert.equal(res.body.kept.length, 1);
    assert.equal(res.body.kept[0].name, 'Ostaje');
    assert.equal(await Artist.countDocuments().setOptions({ withDeleted: true }), 1);
  });
});


describe('permanently deleting a single song', () => {
  /**
   * AI-TRAP: this used to delete ratings and reviews and nothing else, so a
   * purged song left its comments, reports, notifications and fingerprint
   * pointing at an id that no longer resolves — while emptying the trash
   * cleaned all six. The same act, two different amounts of wreckage, and the
   * narrower one was the button people actually press. Five orphaned
   * notifications were already sitting in the development database.
   */
  test('takes everything pointing at it along', async () => {
    const token = await signIn('superadmin');
    const artist = await Artist.findOrCreateByName('Testni');
    const song = await makeSong('Ide zauvijek', artist, { deleted: true });

    const user = new mongoose.Types.ObjectId();
    const review = await Review.create({ song: song._id, user, rating: 5, body: 'tekst recenzije' });

    await Promise.all([
      Rating.create({ song: song._id, arrangement: song.arrangements[0]._id, user, value: 4 }),
      ReviewComment.create({ review: review._id, song: song._id, user, body: 'komentar' }),
      SongReport.create({ song: song._id, user, kind: 'chords', note: 'akord ne valja' }),
      Notification.create({ type: 'review.created', song: song._id }),
      AudioPrint.create({
        song: song._id, hashes: Buffer.alloc(12), hashCount: 2, seconds: 30, version: 1
      })
    ]);

    const res = await api(`/songs/${song._id}/purge`, { method: 'DELETE', token });
    assert.equal(res.status, 200);

    for (const [name, model] of [
      ['ocjene', Rating], ['recenzije', Review], ['komentari', ReviewComment],
      ['prijave', SongReport], ['obavjestenja', Notification], ['otisci', AudioPrint]
    ]) {
      assert.equal(await model.countDocuments({ song: song._id }), 0, `${name} su ostali kao siroce`);
    }
  });

  test('does not touch what belongs to another song', async () => {
    const token = await signIn('superadmin');
    const artist = await Artist.findOrCreateByName('Testni');
    const doomed = await makeSong('Ide', artist, { deleted: true });
    const spared = await makeSong('Ostaje', artist);

    const user = new mongoose.Types.ObjectId();
    await Notification.create({ type: 'review.created', song: doomed._id });
    await Notification.create({ type: 'review.created', song: spared._id });

    await api(`/songs/${doomed._id}/purge`, { method: 'DELETE', token });

    assert.equal(await Notification.countDocuments({ song: spared._id }), 1);
    assert.equal(await Notification.countDocuments({ song: doomed._id }), 0);
  });
});

describe('the counter', () => {
  test('says what would disappear', async () => {
    const token = await signIn('admin');
    const artist = await Artist.findOrCreateByName('Testni');
    await makeSong('A', artist, { deleted: true });
    await makeSong('B', artist, { deleted: true });
    await makeSong('Ziva', artist);

    const res = await api('/trash/count', { token });
    assert.equal(res.body.songs, 2);
    assert.equal(res.body.total, 2);
  });
});
