import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as OTPAuth from 'otpauth';
import { start, stop, reset, api } from './helpers.js';

const EDITOR = { email: 'urednik@test.local', password: 'lozinka1234', name: 'Urednik' };

let Staff;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
});
after(stop);
beforeEach(reset);

const codeFor = (secret, offset = 0) =>
  new OTPAuth.TOTP({
    issuer: 'Octava', label: EDITOR.email, algorithm: 'SHA1', digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(secret)
  }).generate({ timestamp: Date.now() + offset * 30000 });

/** Signs in, enrols a second factor, and hands back what the tests need. */
async function enrol() {
  await Staff.create({
    email: EDITOR.email, name: EDITOR.name, role: 'worker',
    passwordHash: await Staff.hashPassword(EDITOR.password)
  });

  const login = await api('/auth/staff/login', {
    method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
  });
  const token = login.body.token;

  const setup = await api('/auth/staff/2fa/setup', { method: 'POST', token });
  const secret = setup.body.secret;

  const enabled = await api('/auth/staff/2fa/enable', {
    method: 'POST', token, body: { code: codeFor(secret) }
  });

  // Enrolment consumes the current counter. Clearing it here isolates each
  // test from wall-clock timing rather than making them wait out a window.
  await Staff.updateOne({ email: EDITOR.email }, { $unset: { totpLastCounter: '' } });

  return { token, secret, backupCodes: enabled.body.backupCodes };
}

describe('postavljanje drugog faktora', () => {
  test('daje tajnu i QR kod', async () => {
    await Staff.create({
      email: EDITOR.email, name: EDITOR.name, role: 'worker',
      passwordHash: await Staff.hashPassword(EDITOR.password)
    });
    const login = await api('/auth/staff/login', {
      method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
    });
    const res = await api('/auth/staff/2fa/setup', { method: 'POST', token: login.body.token });

    assert.equal(res.status, 200);
    assert.ok(res.body.secret);
    assert.match(res.body.qr, /^data:image\/png;base64,/);
  });

  test('pogresan kod ne ukljucuje', async () => {
    await Staff.create({
      email: EDITOR.email, name: EDITOR.name, role: 'worker',
      passwordHash: await Staff.hashPassword(EDITOR.password)
    });
    const login = await api('/auth/staff/login', {
      method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
    });
    await api('/auth/staff/2fa/setup', { method: 'POST', token: login.body.token });

    const res = await api('/auth/staff/2fa/enable', {
      method: 'POST', token: login.body.token, body: { code: '000000' }
    });
    assert.equal(res.status, 400);

    const staff = await Staff.findOne({ email: EDITOR.email });
    assert.equal(staff.totpEnabled, false, 'ukljucen bez ispravnog koda');
  });

  test('vraca deset rezervnih kodova, i to samo jednom', async () => {
    const { backupCodes } = await enrol();
    assert.equal(backupCodes.length, 10);

    // Stored hashed: a database leak must not hand over a way past the factor.
    const staff = await Staff.findOne({ email: EDITOR.email }).select('+backupCodes');
    for (const stored of staff.backupCodes) {
      assert.ok(!backupCodes.includes(stored), 'rezervni kod cuvan u citljivom obliku');
    }
  });
});

describe('dvokoracna prijava', () => {
  test('lozinka sama ne daje sesiju', async () => {
    await enrol();
    const res = await api('/auth/staff/login', {
      method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
    });

    assert.equal(res.body.twoFactorRequired, true);
    assert.equal(res.body.token, undefined, 'sesija izdata prije drugog koraka');
    assert.ok(res.body.challenge);
  });

  test('medjukorak nije upotrebljiv kao sesija', async () => {
    await enrol();
    const login = await api('/auth/staff/login', {
      method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
    });

    // Were this accepted, step one would be a complete login and the second
    // factor decoration.
    for (const path of ['/auth/staff/me', '/stats/overview']) {
      const res = await api(path, { token: login.body.challenge });
      assert.equal(res.status, 401, `${path} prihvatio medjukorak`);
    }
  });

  test('tacan kod daje sesiju', async () => {
    const { secret } = await enrol();
    const login = await api('/auth/staff/login', {
      method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
    });
    const res = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: login.body.challenge, code: codeFor(secret) }
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  test('isti kod se ne moze upotrijebiti dvaput', async () => {
    const { secret } = await enrol();
    const code = codeFor(secret);

    const first = await api('/auth/staff/login', {
      method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
    });
    await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: first.body.challenge, code }
    });

    const second = await api('/auth/staff/login', {
      method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
    });
    const replay = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: second.body.challenge, code }
    });

    // Anyone who reads a code over a shoulder has thirty seconds to reuse it.
    assert.equal(replay.status, 400, 'ponovljeni kod prihvacen');
  });

  test('izmisljen medjukorak se odbija', async () => {
    await enrol();
    const res = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: 'nije.pravi.token', code: '123456' }
    });
    assert.equal(res.status, 401);
  });
});

describe('rezervni kodovi', () => {
  test('rade i trose se', async () => {
    const { backupCodes } = await enrol();

    const login = await api('/auth/staff/login', {
      method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
    });
    const used = await api('/auth/staff/login/verify', {
      method: 'POST', body: { challenge: login.body.challenge, code: backupCodes[0] }
    });

    assert.equal(used.status, 200);
    assert.equal(used.body.backupCodesRemaining, 9);
  });

  test('potroseni kod ne radi ponovo', async () => {
    const { backupCodes } = await enrol();

    for (const attempt of [0, 1]) {
      const login = await api('/auth/staff/login', {
        method: 'POST', body: { email: EDITOR.email, password: EDITOR.password }
      });
      const res = await api('/auth/staff/login/verify', {
        method: 'POST', body: { challenge: login.body.challenge, code: backupCodes[0] }
      });
      if (attempt === 1) assert.equal(res.status, 400, 'potroseni kod ponovo primljen');
    }
  });
});

describe('iskljucivanje', () => {
  test('trazi i lozinku, ne samo kod', async () => {
    const { token, secret } = await enrol();

    // A borrowed unlocked session must not be enough to strip the factor.
    const res = await api('/auth/staff/2fa/disable', {
      method: 'POST', token, body: { code: codeFor(secret) }
    });
    assert.equal(res.status, 401);

    const staff = await Staff.findOne({ email: EDITOR.email });
    assert.equal(staff.totpEnabled, true, 'iskljucen bez lozinke');
  });
});
