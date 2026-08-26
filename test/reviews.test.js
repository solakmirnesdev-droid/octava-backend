import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Staff, Notification, Review, ReviewComment;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: Notification } = await import('../src/models/Notification.js'));
  ({ default: Review } = await import('../src/models/Review.js'));
  ({ default: ReviewComment } = await import('../src/models/ReviewComment.js'));
});
after(stop);
beforeEach(reset);

async function staffToken(role, email) {
  await Staff.create({
    email, name: `Osoba ${role}`, role,
    passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email, password: 'lozinka1234' }
  });
  return res.body.token;
}

/** A published song, an editor who can moderate, and n signed-in readers. */
async function setup(readers = 1) {
  const worker = await staffToken('worker', 'radnik@test.local');
  const created = await api('/songs', {
    method: 'POST', token: worker,
    body: {
      title: 'Recenzirana', artist: 'Neko', content: '[Am]tekst',
      originalKey: 'Am', status: 'published'
    }
  });

  const tokens = [];
  for (let i = 0; i < readers; i++) {
    const res = await api('/auth/register', {
      method: 'POST',
      body: { email: `citalac${i}@test.local`, password: 'lozinka1234', username: `Citalac${i}` }
    });
    tokens.push(res.body.token);
  }
  return { slug: created.body.song.slug, tokens, worker };
}

describe('recenzije', () => {
  test('objavljena recenzija je odmah vidljiva', async () => {
    const { slug, tokens } = await setup(1);

    const res = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Akordi se poklapaju sa originalom.' }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.review.author, 'Citalac0');
    assert.equal(res.body.review.mine, true);

    const list = await api(`/songs/${slug}/reviews`);
    assert.equal(list.body.total, 1);
  });

  test('prekratak tekst se odbija', async () => {
    const { slug, tokens } = await setup(1);
    const res = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'x' }
    });
    assert.equal(res.status, 400);
  });

  test('samo razmaci se broje kao prazno', async () => {
    const { slug, tokens } = await setup(1);
    const res = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: '        ' }
    });
    assert.equal(res.status, 400);
  });

  test('druga recenzija iste pjesme mijenja prvu, ne dodaje novu', async () => {
    const { slug, tokens } = await setup(1);
    await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Prva verzija teksta.' }
    });
    const second = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Druga verzija teksta.' }
    });

    assert.equal(second.status, 200);
    const list = await api(`/songs/${slug}/reviews`);
    assert.equal(list.body.total, 1);
    assert.equal(list.body.items[0].body, 'Druga verzija teksta.');
    assert.ok(list.body.items[0].editedAt, 'editedAt mora biti postavljen');
  });

  test('prijava je obavezna', async () => {
    const { slug } = await setup(0);
    const res = await api(`/songs/${slug}/reviews`, {
      method: 'POST', body: { body: 'Bez naloga ovo ne prolazi.' }
    });
    assert.equal(res.status, 401);
  });

  test('autor uklanja svoju recenziju i ona nestaje iz javnog prikaza', async () => {
    const { slug, tokens } = await setup(1);
    const created = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Ovo cu ukloniti.' }
    });

    const del = await api(`/reviews/${created.body.review._id}`, {
      method: 'DELETE', token: tokens[0]
    });
    assert.equal(del.status, 200);

    const list = await api(`/songs/${slug}/reviews`);
    assert.equal(list.body.total, 0);
  });

  test('tudja recenzija se ne moze ukloniti', async () => {
    const { slug, tokens } = await setup(2);
    const created = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Moja recenzija.' }
    });

    const del = await api(`/reviews/${created.body.review._id}`, {
      method: 'DELETE', token: tokens[1]
    });
    assert.equal(del.status, 403);
  });
});

describe('komentari na recenzije', () => {
  test('komentar podize brojac na recenziji', async () => {
    const { slug, tokens } = await setup(2);
    const review = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Recenzija za komentarisanje.' }
    });

    const c = await api(`/reviews/${review.body.review._id}/comments`, {
      method: 'POST', token: tokens[1], body: { body: 'Slazem se.' }
    });
    assert.equal(c.status, 201);

    const list = await api(`/songs/${slug}/reviews`);
    assert.equal(list.body.items[0].commentCount, 1);
  });

  test('uklanjanje komentara spusta brojac', async () => {
    const { slug, tokens } = await setup(2);
    const review = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Recenzija.' }
    });
    const c = await api(`/reviews/${review.body.review._id}/comments`, {
      method: 'POST', token: tokens[1], body: { body: 'Komentar.' }
    });

    await api(`/comments/${c.body.comment._id}`, { method: 'DELETE', token: tokens[1] });

    const list = await api(`/songs/${slug}/reviews`);
    assert.equal(list.body.items[0].commentCount, 0);
  });

  test('uklanjanje recenzije povlaci i njene komentare', async () => {
    const { slug, tokens } = await setup(2);
    const review = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Recenzija sa odgovorima.' }
    });
    const id = review.body.review._id;
    await api(`/reviews/${id}/comments`, {
      method: 'POST', token: tokens[1], body: { body: 'Odgovor.' }
    });

    await api(`/reviews/${id}`, { method: 'DELETE', token: tokens[0] });

    const comments = await api(`/reviews/${id}/comments`);
    assert.equal(comments.body.items.length, 0);
  });
});

describe('moderacija', () => {
  test('sakrivanje bez razloga se odbija', async () => {
    const { slug, tokens } = await setup(1);
    const admin = await staffToken('admin', 'urednik@test.local');
    const review = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Recenzija za moderaciju.' }
    });

    const res = await api(`/moderation/reviews/${review.body.review._id}`, {
      method: 'PATCH', token: admin, body: { hidden: true }
    });
    assert.equal(res.status, 400);
  });

  test('sakrivena recenzija nestaje iz javnog prikaza i biljezi ko je sakrio', async () => {
    const { slug, tokens } = await setup(1);
    const admin = await staffToken('admin', 'urednik@test.local');
    const review = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Sporna recenzija.' }
    });

    const res = await api(`/moderation/reviews/${review.body.review._id}`, {
      method: 'PATCH', token: admin, body: { hidden: true, reason: 'Uvredljiv sadrzaj' }
    });
    assert.equal(res.status, 200);

    const list = await api(`/songs/${slug}/reviews`);
    assert.equal(list.body.total, 0);

    const dash = await api('/moderation/reviews?status=hidden', { token: admin });
    assert.equal(dash.body.items[0].moderationReason, 'Uvredljiv sadrzaj');
    // Staff carry `name`; populating `username` would leave this undefined.
    assert.equal(dash.body.items[0].moderatedBy.name, 'Osoba admin');
  });

  test('autor ne moze izmjenom vratiti sakrivenu recenziju', async () => {
    const { slug, tokens } = await setup(1);
    const admin = await staffToken('admin', 'urednik@test.local');
    const review = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Bit ce sakrivena.' }
    });
    await api(`/moderation/reviews/${review.body.review._id}`, {
      method: 'PATCH', token: admin, body: { hidden: true, reason: 'Razlog' }
    });

    const retry = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Pokusaj zaobilaska.' }
    });
    assert.equal(retry.status, 403);

    const list = await api(`/songs/${slug}/reviews`);
    assert.equal(list.body.total, 0);
  });

  test('radnik nema pristup moderaciji', async () => {
    const { worker } = await setup(0);
    const res = await api('/moderation/reviews', { token: worker });
    assert.equal(res.status, 403);
  });
});

describe('obavjestenja', () => {
  test('recenzija i komentar podizu obavjestenja', async () => {
    const { slug, tokens } = await setup(2);
    const admin = await staffToken('admin', 'urednik@test.local');

    const review = await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Recenzija koja pravi obavjestenje.' }
    });
    await api(`/reviews/${review.body.review._id}/comments`, {
      method: 'POST', token: tokens[1], body: { body: 'Komentar.' }
    });

    const feed = await api('/notifications', { token: admin });
    assert.equal(feed.status, 200);

    /**
     * Counted by type, not by total.
     *
     * Registering the readers this test needs raises its own notifications, so
     * asserting on the total made the test a hostage to every event the desk
     * ever learns about. What it actually cares about is that the review and
     * the comment each produced exactly one.
     */
    const types = feed.body.items.map((i) => i.type);
    assert.equal(types.filter((t) => t === 'review.created').length, 1);
    assert.equal(types.filter((t) => t === 'comment.created').length, 1);
    assert.ok(feed.body.unread >= 2, 'oba moraju biti neprocitana');
  });

  test('oznaceno kao procitano se ne broji dvaput', async () => {
    const { slug, tokens } = await setup(1);
    const admin = await staffToken('admin', 'urednik@test.local');
    await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Jedna recenzija.' }
    });

    await api('/notifications/read', { method: 'POST', token: admin, body: {} });
    await api('/notifications/read', { method: 'POST', token: admin, body: {} });

    const feed = await api('/notifications', { token: admin });
    assert.equal(feed.body.unread, 0);

    const row = await Notification.findOne({ type: 'review.created' });
    assert.equal(row.readBy.length, 1, 'readBy ne smije rasti pri ponovnom oznacavanju');
  });

  test('procitano je po clanu, ne globalno', async () => {
    const { slug, tokens } = await setup(1);
    const first = await staffToken('admin', 'prvi@test.local');
    const second = await staffToken('admin', 'drugi@test.local');
    await api(`/songs/${slug}/reviews`, {
      method: 'POST', token: tokens[0], body: { body: 'Recenzija.' }
    });

    await api('/notifications/read', { method: 'POST', token: first, body: {} });

    const a = await api('/notifications', { token: first });
    const b = await api('/notifications', { token: second });

    // The point is that read state is per member, not the exact count — which
    // shifts whenever another kind of event starts being recorded.
    assert.equal(a.body.unread, 0, 'prvi clan je sve procitao');
    assert.ok(b.body.unread > 0, 'drugi clan mora i dalje imati neprocitano');
    assert.ok(
      b.body.items.some((i) => i.type === 'review.created' && !i.read),
      'recenzija mora ostati neprocitana za drugog clana'
    );
  });
});
