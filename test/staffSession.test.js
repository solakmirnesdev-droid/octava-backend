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
describe('sesija uredništva traje kratko i obnavlja se', () => {
  test('token se izdaje na 60 minuta, ne na 7 dana', async () => {
    const token = await signIn();
    assert.equal(lifetimeMinutes(token), 60);
  });

  test('javni nalog i dalje dobija dugu sesiju', async () => {
    const email = 'citalac@test.local';
    await api('/auth/register', {
      method: 'POST', body: { email, password: PASSWORD, username: 'citalac' }
    });
    const res = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });

    // The short session is the desk's, not the site's. Signing a reader out
    // every hour would be a regression dressed up as a security fix.
    assert.ok(lifetimeMinutes(res.body.token) > 60, 'citaocu je skracena sesija');
  });

  test('obnova vraća novi upotrebljiv token', async () => {
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

  test('obnova bez prijave je odbijena', async () => {
    const res = await api('/auth/staff/renew', { method: 'POST' });
    assert.equal(res.status, 401);
  });

  test('istekao token se ne moze obnoviti', async () => {
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

  test('deaktiviran nalog ne moze obnoviti sesiju', async () => {
    const token = await signIn();
    await Staff.updateOne({ email: 'admin@test.local' }, { $set: { active: false } });

    // Deactivation is the kill switch; renewal must not walk around it.
    const res = await api('/auth/staff/renew', { method: 'POST', token });
    assert.equal(res.status, 403);
  });
});
