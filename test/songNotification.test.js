import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

/**
 * The desk hearing about its own additions.
 *
 * AI-NOTE: the failure this guards is quiet. Notification.raise swallows its
 * own errors on purpose — a broken feed must never fail a save — so a
 * notification that stops being written looks exactly like a catalogue nobody
 * is adding to.
 */

let Staff, Notification;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: Notification } = await import('../src/models/Notification.js'));
});
after(stop);
beforeEach(reset);

async function signIn(role, name = role) {
  const email = `${name}@test.local`;
  await Staff.create({
    email, name, role, passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email, password: 'lozinka1234' }
  });
  return res.body.token;
}

const addSong = (token, title, artist = 'Testni') => api('/songs', {
  method: 'POST', token,
  body: { title, artist, content: '[Am]tekst', originalKey: 'Am', status: 'published' }
});

describe('obavjestenje o dodanoj pjesmi', () => {
  test('nastaje, i nosi ko je dodao i s kojom ulogom', async () => {
    const token = await signIn('admin', 'ana');
    const res = await addSong(token, 'Nova pjesma');
    assert.equal(res.status, 201);

    const rows = await Notification.find({ type: 'song.created' });
    assert.equal(rows.length, 1);

    const n = rows[0];
    assert.equal(n.actorName, 'ana');
    assert.equal(n.actorRole, 'admin');
    assert.ok(n.staffActor, 'nema veze na nalog koji je dodao');
    assert.match(n.summary, /ana/);
    assert.match(n.summary, /Nova pjesma/);
  });

  /**
   * AI-TRAP: name and role are COPIED, not referenced. A row that reads
   * "unknown added a song" once an account is closed records nothing, which is
   * the same reason AuditLog copies them.
   */
  test('prezivljava gasenje naloga koji ju je dodao', async () => {
    const token = await signIn('worker', 'bane');
    await addSong(token, 'Ostaje zapisano');

    const staff = await Staff.findOne({ name: 'bane' });
    await Staff.deleteOne({ _id: staff._id });

    const n = await Notification.findOne({ type: 'song.created' });
    assert.equal(n.actorName, 'bane');
    assert.equal(n.actorRole, 'worker');
  });

  test('stize u nepricitane na spisku obavjestenja', async () => {
    const author = await signIn('admin', 'ana');
    await addSong(author, 'Vidljiva');

    // A second member has not read it, so it counts for them.
    const other = await signIn('worker', 'bane');
    const feed = await api('/notifications', { token: other });

    const row = feed.body.items.find((x) => x.type === 'song.created');
    assert.ok(row, 'obavjestenje nije u spisku');
    // The role has to reach the client, or the row cannot say who did it.
    assert.equal(row.actorName, 'ana');
    assert.equal(row.actorRole, 'admin');

    const count = await api('/notifications/unread-count', { token: other });
    assert.ok(count.body.unread >= 1, 'ne broji se kao neprocitano');
  });

  test('jedna pjesma daje tacno jedno obavjestenje', async () => {
    const token = await signIn('admin', 'ana');
    await addSong(token, 'Prva');
    await addSong(token, 'Druga');
    assert.equal(await Notification.countDocuments({ type: 'song.created' }), 2);
  });
});
