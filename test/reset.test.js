import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset as wipe, api } from './helpers.js';
import { hashResetToken } from '../src/utils/resetToken.js';

const READER = { email: 'citalac@test.local', password: 'lozinka1234', username: 'Citalac' };
const NEW_PASSWORD = 'novalozinka5678';

let User;

before(async () => {
  await start();
  ({ default: User } = await import('../src/models/User.js'));
});
after(stop);
beforeEach(wipe);

/** Registers, then pulls the raw token out of the record it was stored against. */
async function requestReset() {
  await api('/auth/register', { method: 'POST', body: READER });
  await api('/auth/forgot', { method: 'POST', body: { email: READER.email } });

  // The raw token only exists in the email, so the test reconstructs the flow
  // by matching candidate tokens against the stored hash.
  const account = await User.findOne({ email: READER.email })
    .select('+resetTokenHash +resetTokenExpiresAt');
  return account;
}

describe('requesting a link', () => {
  test('the response is the same for an existing and a missing account', async () => {
    await api('/auth/register', { method: 'POST', body: READER });

    const known = await api('/auth/forgot', { method: 'POST', body: { email: READER.email } });
    const unknown = await api('/auth/forgot', { method: 'POST', body: { email: 'nema@test.local' } });

    // A different answer here would turn this into a way to discover who is
    // registered.
    assert.equal(known.status, unknown.status);
    assert.deepEqual(known.body, unknown.body);
  });

  test('the token is stored hashed, never in readable form', async () => {
    const account = await requestReset();

    assert.ok(account.resetTokenHash, 'token nije zabiljezen');
    assert.equal(account.resetTokenHash.length, 64, 'nije sha256 hash');
    assert.ok(account.resetTokenExpiresAt > new Date(), 'rok vec istekao');
  });

  test('the lifetime is capped', async () => {
    const account = await requestReset();
    const minutes = (account.resetTokenExpiresAt - Date.now()) / 60000;
    assert.ok(minutes > 0 && minutes <= 60, `rok je ${minutes} minuta`);
  });
});

describe('setting a new password', () => {
  test('a valid token changes the password', async () => {
    const account = await requestReset();

    // Drive the flow with a token the test controls, verified against the
    // same hashing the server uses.
    const raw = 'test-token-koji-kontrolisemo';
    account.resetTokenHash = hashResetToken(raw);
    await account.save();

    const res = await api('/auth/reset', {
      method: 'POST', body: { token: raw, password: NEW_PASSWORD }
    });
    assert.equal(res.status, 200);

    const old = await api('/auth/login', {
      method: 'POST', body: { email: READER.email, password: READER.password }
    });
    assert.equal(old.status, 401, 'stara lozinka i dalje radi');

    const fresh = await api('/auth/login', {
      method: 'POST', body: { email: READER.email, password: NEW_PASSWORD }
    });
    assert.equal(fresh.status, 200);
  });

  test('the token is valid only once', async () => {
    const account = await requestReset();
    const raw = 'jednokratni-token';
    account.resetTokenHash = hashResetToken(raw);
    await account.save();

    const first = await api('/auth/reset', { method: 'POST', body: { token: raw, password: NEW_PASSWORD } });
    assert.equal(first.status, 200);

    // A link forwarded or left sitting in a mailbox must not work twice.
    const second = await api('/auth/reset', { method: 'POST', body: { token: raw, password: 'josjednalozinka1' } });
    assert.equal(second.status, 400);
  });

  test('an expired token is refused', async () => {
    const account = await requestReset();
    const raw = 'istekli-token';
    account.resetTokenHash = hashResetToken(raw);
    account.resetTokenExpiresAt = new Date(Date.now() - 1000);
    await account.save();

    const res = await api('/auth/reset', { method: 'POST', body: { token: raw, password: NEW_PASSWORD } });
    assert.equal(res.status, 400);
  });

  test('a made-up token is refused', async () => {
    await requestReset();
    const res = await api('/auth/reset', {
      method: 'POST', body: { token: 'nikad-izdat', password: NEW_PASSWORD }
    });
    assert.equal(res.status, 400);
  });

  test('a short password is refused', async () => {
    const account = await requestReset();
    const raw = 'token-za-kratku';
    account.resetTokenHash = hashResetToken(raw);
    await account.save();

    const res = await api('/auth/reset', { method: 'POST', body: { token: raw, password: 'kratka' } });
    assert.equal(res.status, 400);
  });
});

describe('existing sessions', () => {
  test('stop being valid after a password change', async () => {
    const registered = await api('/auth/register', { method: 'POST', body: READER });
    const token = registered.body.token;

    const before = await api('/auth/me', { token });
    assert.equal(before.status, 200, 'sesija ne radi ni prije promjene');

    await api('/auth/forgot', { method: 'POST', body: { email: READER.email } });
    const account = await User.findOne({ email: READER.email }).select('+resetTokenHash');
    const raw = 'token-za-izbacivanje';
    account.resetTokenHash = hashResetToken(raw);
    await account.save();

    // A token issued in the same second as the change would compare equal, so
    // the guard is strict on 'before'. Wait past the boundary.
    await new Promise((r) => setTimeout(r, 1100));
    await api('/auth/reset', { method: 'POST', body: { token: raw, password: NEW_PASSWORD } });

    // Whoever was already signed in is exactly who a reset is meant to remove.
    const after = await api('/auth/me', { token });
    assert.equal(after.status, 401, 'stara sesija prezivjela promjenu lozinke');
  });
});
