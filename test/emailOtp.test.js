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

/**
 * The console transport prints the code, so the suite reads it back the way a
 * person would read their inbox. Nothing is stubbed: this exercises the real
 * issue-hash-send path, and a change that stopped mailing the code would fail
 * here rather than in production.
 */
async function capture(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try {
    const result = await fn();
    const match = lines.join('\n').match(/Tvoj kod za prijavu je: (\d{6})/);
    return { result, code: match?.[1] || null };
  } finally {
    console.log = original;
  }
}

const PASSWORD = 'lozinka1234';

async function makeStaff(email = 'urednik@test.local') {
  await Staff.create({
    email, name: 'Urednik', role: 'admin',
    passwordHash: await Staff.hashPassword(PASSWORD)
  });
  const res = await api('/auth/staff/login', { method: 'POST', body: { email, password: PASSWORD } });
  return res.body.token;
}

/** Turns email codes on for an account that has just signed in. */
async function enableEmail(token) {
  const { code } = await capture(() =>
    api('/auth/staff/2fa/email/setup', { method: 'POST', token, body: { password: PASSWORD } }));
  assert.ok(code, 'kod nije poslan');
  const on = await api('/auth/staff/2fa/email/enable', { method: 'POST', token, body: { code } });
  assert.equal(on.status, 200, JSON.stringify(on.body));
  return on.body;
}

describe('turning on email confirmation', () => {
  test('requires the password', async () => {
    const token = await makeStaff();
    const res = await api('/auth/staff/2fa/email/setup', {
      method: 'POST', token, body: { password: 'pogresna' }
    });
    assert.equal(res.status, 401);
  });

  test('the emailed code enables the factor and gives backup codes', async () => {
    const token = await makeStaff();
    const body = await enableEmail(token);
    assert.equal(body.enabled, true);
    assert.equal(body.backupCodes.length > 0, true);

    const me = await api('/auth/staff/me', { token });
    assert.equal(me.body.user.emailOtpEnabled, true);
  });

  test('a wrong code enables nothing', async () => {
    const token = await makeStaff();
    await capture(() => api('/auth/staff/2fa/email/setup', { method: 'POST', token, body: { password: PASSWORD } }));
    const res = await api('/auth/staff/2fa/email/enable', { method: 'POST', token, body: { code: '000000' } });
    assert.equal(res.status, 400);
    assert.equal((await api('/auth/staff/me', { token })).body.user.emailOtpEnabled, false);
  });
});

describe('signing in with an emailed code', () => {
  test('the password alone gives no session, the code arrives by email', async () => {
    const token = await makeStaff();
    await enableEmail(token);

    const { result, code } = await capture(() =>
      api('/auth/staff/login', { method: 'POST', body: { email: 'urednik@test.local', password: PASSWORD } }));

    assert.equal(result.body.twoFactorRequired, true);
    assert.deepEqual(result.body.methods, ['email']);
    assert.ok(!result.body.token, 'sesija je izdata bez drugog faktora');
    assert.ok(code, 'kod nije poslan pri prijavi');

    const done = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: result.body.challenge, code }
    });
    assert.equal(done.status, 200);
    assert.ok(done.body.token);
  });

  test('the code is valid once', async () => {
    const token = await makeStaff();
    await enableEmail(token);
    const { result, code } = await capture(() =>
      api('/auth/staff/login', { method: 'POST', body: { email: 'urednik@test.local', password: PASSWORD } }));

    await api('/auth/staff/login/verify', { method: 'POST', body: { challenge: result.body.challenge, code } });

    const again = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: result.body.challenge, code }
    });
    assert.equal(again.status, 400);
  });

  test('five wrong attempts burn the code', async () => {
    // Six digits is a million values, which is not many when the attacker
    // already holds a valid challenge. The cap is the factor, not the entropy.
    const token = await makeStaff();
    await enableEmail(token);
    const { result, code } = await capture(() =>
      api('/auth/staff/login', { method: 'POST', body: { email: 'urednik@test.local', password: PASSWORD } }));

    for (let i = 0; i < 5; i++) {
      await api('/auth/staff/login/verify', {
        method: 'POST', body: { challenge: result.body.challenge, code: '000000' }
      });
    }

    const correct = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: result.body.challenge, code }
    });
    assert.equal(correct.status, 400, 'tacan kod je prosao nakon pet promasaja');
    assert.match(correct.body.message, /pokušaja/i);
  });

  test('an expired code is refused', async () => {
    const token = await makeStaff();
    await enableEmail(token);
    const { result, code } = await capture(() =>
      api('/auth/staff/login', { method: 'POST', body: { email: 'urednik@test.local', password: PASSWORD } }));

    await Staff.updateOne(
      { email: 'urednik@test.local' },
      { emailOtpExpires: new Date(Date.now() - 1000) }
    );

    const res = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: result.body.challenge, code }
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /istekao/i);
  });

  test('a new code invalidates the old one', async () => {
    const token = await makeStaff();
    await enableEmail(token);
    const first = await capture(() =>
      api('/auth/staff/login', { method: 'POST', body: { email: 'urednik@test.local', password: PASSWORD } }));

    const second = await capture(() =>
      api('/auth/staff/login/resend-code', { method: 'POST', body: { challenge: first.result.body.challenge } }));
    assert.ok(second.code && second.code !== first.code);

    const stale = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: first.result.body.challenge, code: first.code }
    });
    assert.equal(stale.status, 400, 'stari kod je i dalje vrijedio');

    const fresh = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: first.result.body.challenge, code: second.code }
    });
    assert.equal(fresh.status, 200);
  });

  test('a backup code still works with the email factor', async () => {
    const token = await makeStaff();
    const { backupCodes } = await enableEmail(token);

    const { result } = await capture(() =>
      api('/auth/staff/login', { method: 'POST', body: { email: 'urednik@test.local', password: PASSWORD } }));

    const res = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: result.body.challenge, code: backupCodes[0] }
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });
});

describe('turning it off', () => {
  test('requires the password and clears the code', async () => {
    const token = await makeStaff();
    await enableEmail(token);

    assert.equal((await api('/auth/staff/2fa/email/disable', {
      method: 'POST', token, body: { password: 'pogresna' }
    })).status, 401);

    assert.equal((await api('/auth/staff/2fa/email/disable', {
      method: 'POST', token, body: { password: PASSWORD }
    })).status, 200);

    const after = await Staff.findOne({ email: 'urednik@test.local' })
      .select('+emailOtpHash +emailOtpExpires');
    assert.equal(after.emailOtpEnabled, false);
    assert.equal(after.emailOtpHash, undefined);

    // Password alone gets in again.
    const login = await api('/auth/staff/login', {
      method: 'POST', body: { email: 'urednik@test.local', password: PASSWORD }
    });
    assert.ok(login.body.token);
  });
});
