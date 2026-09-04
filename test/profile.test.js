import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let User;
let base;

before(async () => {
  base = await start();
  ({ default: User } = await import('../src/models/User.js'));
});
after(stop);
beforeEach(reset);

async function signUp(extra = {}) {
  const res = await api('/auth/register', {
    method: 'POST',
    body: { email: 'citalac@test.local', password: 'lozinka1234', username: 'Citalac', ...extra }
  });
  return { token: res.body.token, user: res.body.user, status: res.status };
}

/** A 20-byte buffer that opens with the RIFF/WEBP magic the check looks for. */
function fakeWebp() {
  const buf = Buffer.alloc(24);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(16, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  return buf;
}


describe('signup with a country', () => {
  test('the country is optional', async () => {
    const { status, user } = await signUp();
    assert.equal(status, 201);
    assert.equal(user.country, null);
    assert.equal(user.flag, null);
  });

  test('when sent, it comes back with a flag', async () => {
    const { user } = await signUp({ country: 'ba' });
    assert.equal(user.country, 'BA');
    assert.equal(user.flag, '🇧🇦');
  });

  test('an invalid code is refused', async () => {
    const res = await api('/auth/register', {
      method: 'POST',
      body: { email: 'drugi@test.local', password: 'lozinka1234', username: 'Drugi', country: 'Bosna' }
    });
    assert.ok(res.status >= 400 && res.status < 500,
      `neispravna drzava je prosla (status ${res.status})`);
  });
});

describe('the profile', () => {
  test('name and country are read and changed', async () => {
    const { token } = await signUp();

    const mine = await api('/me', { token });
    assert.equal(mine.body.user.username, 'Citalac');

    const changed = await api('/me', { method: 'PATCH', token, body: { username: 'Novo Ime', country: 'HR' } });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.user.username, 'Novo Ime');
    assert.equal(changed.body.user.flag, '🇭🇷');
  });

  test('an empty country clears it, an omitted one leaves it alone', async () => {
    const { token } = await signUp({ country: 'BA' });

    await api('/me', { method: 'PATCH', token, body: { username: 'Isti' } });
    assert.equal((await api('/me', { token })).body.user.country, 'BA', 'izostavljena drzava je obrisana');

    await api('/me', { method: 'PATCH', token, body: { country: '' } });
    assert.equal((await api('/me', { token })).body.user.country, null);
  });

  test('a name that is too short is refused', async () => {
    const { token } = await signUp();
    const res = await api('/me', { method: 'PATCH', token, body: { username: 'a' } });
    assert.equal(res.status, 400);
  });

  test('the email is never sent alongside a review by someone else', async () => {
    const { token } = await signUp();
    const staff = await import('../src/models/Staff.js').then((m) => m.default);
    await staff.create({
      email: 'radnik@test.local', name: 'Radnik', role: 'worker',
      passwordHash: await staff.hashPassword('lozinka1234')
    });
    const s = await api('/auth/staff/login', { method: 'POST', body: { email: 'radnik@test.local', password: 'lozinka1234' } });
    const song = await api('/songs', {
      method: 'POST', token: s.body.token,
      body: { title: 'Pjesma', artist: 'Neko', content: '[Am]a', originalKey: 'Am', status: 'published' }
    });

    await api(`/songs/${song.body.song.slug}/reviews`, {
      method: 'POST', token, body: { rating: 5, body: 'Odlično odrađeno.' }
    });

    const list = await api(`/songs/${song.body.song.slug}/reviews`);
    const [review] = list.body.items;
    assert.equal(review.author, 'Citalac');
    assert.ok('authorFlag' in review, 'zastavica autora se ne salje');
    assert.ok('authorHasAvatar' in review);
    assert.equal(JSON.stringify(review).includes('citalac@test.local'), false, 'email je procurio');
  });
});

describe('changing the email address', () => {
  test('requires the password', async () => {
    const { token } = await signUp();
    const res = await api('/me/email', { method: 'PATCH', token, body: { email: 'nova@test.local' } });
    assert.equal(res.status, 400);
  });

  test('a wrong password changes nothing', async () => {
    const { token } = await signUp();
    const res = await api('/me/email', {
      method: 'PATCH', token, body: { email: 'nova@test.local', password: 'pogresna1234' }
    });
    assert.equal(res.status, 401);
    assert.ok(await User.findOne({ email: 'citalac@test.local' }));
  });

  test('the right password changes the address and clears the confirmation', async () => {
    const { token } = await signUp();
    await User.updateOne({ email: 'citalac@test.local' }, { emailVerified: true });

    const res = await api('/me/email', {
      method: 'PATCH', token, body: { email: 'Nova@Test.local', password: 'lozinka1234' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'nova@test.local');
    assert.equal(res.body.user.emailVerified, false, 'nova adresa je ostala oznacena kao potvrdjena');
  });

  test('an address already taken is refused', async () => {
    await api('/auth/register', {
      method: 'POST', body: { email: 'zauzeta@test.local', password: 'lozinka1234', username: 'Neko' }
    });
    const { token } = await signUp();

    const res = await api('/me/email', {
      method: 'PATCH', token, body: { email: 'zauzeta@test.local', password: 'lozinka1234' }
    });
    assert.equal(res.status, 409);
  });
});

describe('changing the password', () => {
  test('asks for the current one and changes to the new one', async () => {
    const { token } = await signUp();

    const wrong = await api('/me/password', {
      method: 'PATCH', token, body: { currentPassword: 'pogresna1234', newPassword: 'novalozinka1' }
    });
    assert.equal(wrong.status, 401);

    const ok = await api('/me/password', {
      method: 'PATCH', token, body: { currentPassword: 'lozinka1234', newPassword: 'novalozinka1' }
    });
    assert.equal(ok.status, 200);

    const login = await api('/auth/login', {
      method: 'POST', body: { email: 'citalac@test.local', password: 'novalozinka1' }
    });
    assert.equal(login.status, 200);
  });

  test('returns a fresh session, so it does not throw you off the page', async () => {
    const { token } = await signUp();
    const res = await api('/me/password', {
      method: 'PATCH', token, body: { currentPassword: 'lozinka1234', newPassword: 'novalozinka1' }
    });

    assert.ok(res.body.token, 'nije vracen novi token');
    // AI-TRAP: passwordChangedAt invalidates the old token, including the one
    // that made this request. The new one has to work immediately.
    const after = await api('/me', { token: res.body.token });
    assert.equal(after.status, 200);
  });

  test('the old session stops being valid', async () => {
    const { token } = await signUp();
    await api('/me/password', {
      method: 'PATCH', token, body: { currentPassword: 'lozinka1234', newPassword: 'novalozinka1' }
    });

    const old = await api('/me', { token });
    assert.equal(old.status, 401, 'stara sesija je prezivjela promjenu lozinke');
  });

  test('a password changed in the same second still ends the old session', async () => {
    /*
     * The case that made the test above flaky rather than failing: `iat` is
     * seconds, so a password changed in the same second the token was issued
     * compared equal and the old session survived. One second wide, and on the
     * one action somebody takes when they believe they are compromised.
     *
     * Forced rather than waited for: the old test only hit it when the clock
     * happened to land badly, which is roughly one run in three — the worst
     * kind of red, because it teaches people to re-run instead of to look.
     */
    const { token } = await signUp();
    const jwt = (await import('jsonwebtoken')).default;
    const { iat, iatMs } = jwt.decode(token);

    /*
     * The last millisecond of the token's own second: later than the token by
     * milliseconds, identical to it by seconds. `iat * 1000 + 500` is not safe
     * here — iatMs carries the real remainder, which is past 500 half the time.
     */
    assert.ok(iatMs, 'token ne nosi iatMs');
    const sameSecond = new Date(iat * 1000 + 999);
    assert.ok(sameSecond.getTime() > iatMs, 'promjena mora biti poslije izdavanja');
    assert.equal(Math.floor(sameSecond.getTime() / 1000), iat, 'ista sekunda');

    await User.updateOne({ email: 'citalac@test.local' }, { $set: { passwordChangedAt: sameSecond } });

    const res = await api('/me', { token });
    assert.equal(res.status, 401, 'stara sesija je prezivjela promjenu u istoj sekundi');
  });

  test('a new password that is too short is refused', async () => {
    const { token } = await signUp();
    const res = await api('/me/password', {
      method: 'PATCH', token, body: { currentPassword: 'lozinka1234', newPassword: 'kratka' }
    });
    assert.equal(res.status, 400);
  });
});

describe('the profile picture', () => {
  /** Raw bytes, so this cannot go through the JSON helper. */
  const putAvatar = (token, buf, type = 'image/webp') =>
    fetch(`${base}/me/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': type, Authorization: `Bearer ${token}` },
      body: buf
    });

  test('accepts WebP and then serves it publicly', async () => {
    const { token, user } = await signUp();
    assert.equal(user.hasAvatar, false);

    const up = await putAvatar(token, fakeWebp());
    assert.equal(up.status, 200);

    assert.equal((await api('/me', { token })).body.user.hasAvatar, true);

    // Public on purpose: it hangs beside every review the person has written.
    const served = await fetch(`${base}/users/${user.id}/avatar`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/webp');
  });

  test('refuses anything that is not WebP, whatever the header claims', async () => {
    const { token } = await signUp();
    // A JPEG renamed and announced as WebP: the header lies, the bytes do not.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 0, 0, 0, 0, 0]);
    const res = await putAvatar(token, jpeg);
    assert.equal(res.status, 415);
  });

  test('deleting returns it to the initial state', async () => {
    const { token, user } = await signUp();
    await putAvatar(token, fakeWebp());

    const gone = await api('/me/avatar', { method: 'DELETE', token });
    assert.equal(gone.status, 200);
    assert.equal((await api('/me', { token })).body.user.hasAvatar, false);
    assert.equal((await fetch(`${base}/users/${user.id}/avatar`)).status, 404);
  });

  test('an account with no picture returns 404, not an empty response', async () => {
    const { user } = await signUp();
    assert.equal((await fetch(`${base}/users/${user.id}/avatar`)).status, 404);
  });
});
