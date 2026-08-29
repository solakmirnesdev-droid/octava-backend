import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let Staff;
let AuditLog;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: AuditLog } = await import('../src/models/AuditLog.js'));
});
after(stop);
beforeEach(reset);

const PASSWORD = 'lozinka1234';

async function signIn(role) {
  const email = `${role}@test.local`;
  await Staff.create({
    email, name: role, role, passwordHash: await Staff.hashPassword(PASSWORD)
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email, password: PASSWORD }
  });
  return res.body.token;
}

const newAccount = (over = {}) => ({
  email: 'novi@test.local',
  name: 'Novi Urednik',
  role: 'worker',
  password: 'dovoljno-duga-lozinka',
  ...over
});

/**
 * Creating an editorial account is the only way a dashboard login exists.
 * Before this route the only path was a shell script on the server, so these
 * cover the door itself: who may open it, and what it refuses to let through.
 */
describe('superadmin pravi naloge za dashboard', () => {
  for (const role of ['worker', 'admin']) {
    test(`${role} ne moze napraviti nalog`, async () => {
      const token = await signIn(role);
      const res = await api('/accounts/staff', {
        method: 'POST', token, body: newAccount()
      });

      assert.equal(res.status, 403);
      // The refusal must not have written anything on its way out.
      assert.equal(await Staff.countDocuments({ email: 'novi@test.local' }), 0);
    });
  }

  test('bez prijave nema kreiranja', async () => {
    const res = await api('/accounts/staff', { method: 'POST', body: newAccount() });
    assert.equal(res.status, 401);
  });

  for (const role of ['worker', 'admin', 'superadmin']) {
    test(`superadmin pravi nalog uloge ${role}`, async () => {
      const token = await signIn('superadmin');
      const res = await api('/accounts/staff', {
        method: 'POST', token, body: newAccount({ role, email: `${role}-novi@test.local` })
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.staff.role, role);
      assert.equal(res.body.staff.active, true);
      // A password hash reaching the client would be the worst kind of leak.
      assert.equal(res.body.staff.passwordHash, undefined);
      assert.equal(res.body.staff.password, undefined);
    });
  }

  /*
   * The point of the whole feature: not that the row exists, but that the
   * person can actually get in with it. A created account that cannot sign in
   * would pass every other assertion here.
   */
  test('novi nalog se stvarno moze prijaviti na dashboard', async () => {
    const token = await signIn('superadmin');
    const account = newAccount({ role: 'admin' });
    await api('/accounts/staff', { method: 'POST', token, body: account });

    const login = await api('/auth/staff/login', {
      method: 'POST', body: { email: account.email, password: account.password }
    });

    assert.equal(login.status, 200);
    assert.ok(login.body.token, 'prijava nije vratila token');
    assert.equal(login.body.user.role, 'admin');
    assert.equal(login.body.user.email, account.email);
  });

  test('email se ne moze duplirati', async () => {
    const token = await signIn('superadmin');
    await api('/accounts/staff', { method: 'POST', token, body: newAccount() });
    const again = await api('/accounts/staff', { method: 'POST', token, body: newAccount({ name: 'Neko Drugi' }) });

    assert.equal(again.status, 409);
    assert.equal(await Staff.countDocuments({ email: 'novi@test.local' }), 1);
  });

  test('email se ne moze duplirati ni drugim pisanjem velikih slova', async () => {
    const token = await signIn('superadmin');
    await api('/accounts/staff', { method: 'POST', token, body: newAccount() });
    const again = await api('/accounts/staff', {
      method: 'POST', token, body: newAccount({ email: 'Novi@Test.Local' })
    });

    assert.equal(again.status, 409);
  });

  test('kratka lozinka je odbijena', async () => {
    const token = await signIn('superadmin');
    const res = await api('/accounts/staff', {
      method: 'POST', token, body: newAccount({ password: 'kratka12' })
    });

    assert.equal(res.status, 400);
    assert.equal(await Staff.countDocuments({ email: 'novi@test.local' }), 0);
  });

  test('nepoznata uloga je odbijena', async () => {
    const token = await signIn('superadmin');
    const res = await api('/accounts/staff', {
      method: 'POST', token, body: newAccount({ role: 'vlasnik' })
    });

    assert.equal(res.status, 400);
    assert.equal(await Staff.countDocuments({ email: 'novi@test.local' }), 0);
  });

  test('kreiranje ostavlja trag u reviziji', async () => {
    const token = await signIn('superadmin');
    await api('/accounts/staff', { method: 'POST', token, body: newAccount({ role: 'admin' }) });

    const entry = await AuditLog.findOne({ entity: 'staff', action: 'create' });
    assert.ok(entry, 'kreiranje naloga nije zapisano');
    assert.equal(entry.entityLabel, 'novi@test.local');
  });
});
