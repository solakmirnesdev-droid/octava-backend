import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Staff;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
});
after(stop);
beforeEach(reset);

async function signIn(role) {
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

/**
 * Ranked permissions fail in a particular way: a route that enumerates roles
 * keeps working for the ones listed and silently excludes anything added
 * later, including the level above them. These check both directions — that
 * a rank is refused what it should not have, and still granted what it should.
 */
describe('accounts are for the superadmin only', () => {
  for (const role of ['worker', 'admin']) {
    test(`${role} cannot reach accounts`, async () => {
      const token = await signIn(role);

      for (const [path, options] of [
        ['/accounts/users', {}],
        ['/accounts/staff', {}],
        ['/accounts/staff/000000000000000000000000', { method: 'PATCH', body: { role: 'superadmin' } }]
      ]) {
        const res = await api(path, { ...options, token });
        assert.equal(res.status, 403, `${role} dobio ${res.status} na ${path}`);
      }
    });
  }

  test('a superadmin can', async () => {
    const token = await signIn('superadmin');
    const users = await api('/accounts/users', { token });
    const staff = await api('/accounts/staff', { token });

    assert.equal(users.status, 200);
    assert.equal(staff.status, 200);
    assert.ok(Array.isArray(users.body.users));
  });

  test('nothing without signing in', async () => {
    const res = await api('/accounts/users');
    assert.equal(res.status, 401);
  });
});

describe('a rank inherits the level below it', () => {
  test('a worker adds songs but does not delete', async () => {
    const token = await signIn('worker');

    const created = await api('/songs', {
      method: 'POST', token,
      body: { title: 'Rang', artist: 'Neko', content: '[Am]x', originalKey: 'Am' }
    });
    assert.equal(created.status, 201);

    const removed = await api(`/songs/${created.body.song.slug}`, { method: 'DELETE', token });
    assert.equal(removed.status, 403, 'worker obrisao pjesmu');
  });

  test('a superadmin deletes, even though deleting requires an admin', async () => {
    // The check asks for a minimum, so the level above passes without being
    // named anywhere in the route.
    const token = await signIn('superadmin');
    const created = await api('/songs', {
      method: 'POST', token,
      body: { title: 'Rang dva', artist: 'Neko', content: '[Am]x', originalKey: 'Am' }
    });
    const removed = await api(`/songs/${created.body.song.slug}`, { method: 'DELETE', token });
    assert.equal(removed.status, 200);
  });
});

describe('protection against locking yourself out', () => {
  test('cannot change their own account', async () => {
    const token = await signIn('superadmin');
    const list = await api('/accounts/staff', { token });
    const self = list.body.staff.find((s) => s.isSelf);

    const res = await api(`/accounts/staff/${self._id}`, {
      method: 'PATCH', token, body: { role: 'worker' }
    });

    // Dropping your own rank locks you out of the screen needed to undo it.
    assert.equal(res.status, 400);
  });

  test('the last superadmin cannot be demoted', async () => {
    const token = await signIn('superadmin');
    await Staff.create({
      email: 'drugi@test.local', name: 'Drugi', role: 'superadmin',
      passwordHash: await Staff.hashPassword('lozinka1234')
    });

    const list = await api('/accounts/staff', { token });
    const other = list.body.staff.find((s) => !s.isSelf);

    // Two exist, so demoting one is allowed.
    const first = await api(`/accounts/staff/${other._id}`, {
      method: 'PATCH', token, body: { role: 'worker' }
    });
    assert.equal(first.status, 200);

    // The remaining one is the caller, and the caller cannot touch themselves,
    // so the system can never be left without a superadmin.
    const self = list.body.staff.find((s) => s.isSelf);
    const second = await api(`/accounts/staff/${self._id}`, {
      method: 'PATCH', token, body: { active: false }
    });
    assert.equal(second.status, 400);
  });
});
