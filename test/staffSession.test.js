import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { start, stop, reset, api } from './helpers.js';

let Staff;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
});
after(stop);
beforeEach(reset);

const PASSWORD = 'lozinka1234';

async function signIn(role = 'admin') {
  const email = `${role}@test.local`;
  await Staff.create({
    email, name: role, role, passwordHash: await Staff.hashPassword(PASSWORD)
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email, password: PASSWORD }
  });
  return res.body.token;
}

/** Reads exp without verifying: the test only cares how long it was issued for. */
const lifetimeMinutes = (token) => {
  const { exp, iat } = jwt.decode(token);
  return Math.round((exp - iat) / 60);
};

/**
 * The dashboard session is short and renewed while somebody works, so the
 * expiry is only ever reached by going idle. These pin both halves: that it is
 * genuinely short, and that renewal needs a session that is still alive.
 */
describe('the editorial session is short and renewable', () => {
  test('the token is issued for 60 minutes, not 7 days', async () => {
    const token = await signIn();
    assert.equal(lifetimeMinutes(token), 60);
  });

  test('a public account still gets a long session', async () => {
    const email = 'citalac@test.local';
    await api('/auth/register', {
      method: 'POST', body: { email, password: PASSWORD, username: 'citalac' }
    });
    const res = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });

    // The short session is the desk's, not the site's. Signing a reader out
    // every hour would be a regression dressed up as a security fix.
    assert.ok(lifetimeMinutes(res.body.token) > 60, 'citaocu je skracena sesija');
  });

  test('renewal returns a new usable token', async () => {
    const token = await signIn();
    const res = await api('/auth/staff/renew', { method: 'POST', token });

    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'obnova nije vratila token');
    assert.equal(lifetimeMinutes(res.body.token), 60);

    // The point of renewing is that the new token actually works.
    const me = await api('/auth/staff/me', { token: res.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, 'admin');
  });

  test('renewal without signing in is refused', async () => {
    const res = await api('/auth/staff/renew', { method: 'POST' });
    assert.equal(res.status, 401);
  });

  test('an expired token cannot be renewed', async () => {
    const staff = await Staff.create({
      email: 'istekao@test.local', name: 'Istekao', role: 'admin',
      passwordHash: await Staff.hashPassword(PASSWORD)
    });
    // Signed in the past: renewal must not be a way to revive a dead session.
    const expired = jwt.sign(
      { sub: staff._id.toString(), realm: 'staff', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '-1m' }
    );

    const res = await api('/auth/staff/renew', { method: 'POST', token: expired });
    assert.equal(res.status, 401);
  });

  test('a deactivated account cannot renew a session', async () => {
    const token = await signIn();
    await Staff.updateOne({ email: 'admin@test.local' }, { $set: { active: false } });

    // Deactivation is the kill switch; renewal must not walk around it.
    const res = await api('/auth/staff/renew', { method: 'POST', token });
    assert.equal(res.status, 403);
  });
});
