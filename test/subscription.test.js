import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, reset, api } from './helpers.js';

let User, Staff, Song, Artist;

before(async () => {
  await start();
  ({ default: User } = await import('../src/models/User.js'));
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: Song } = await import('../src/models/Song.js'));
  ({ default: Artist } = await import('../src/models/Artist.js'));
});
after(stop);

beforeEach(async () => {
  await reset();
  process.env.PAYWALL_ENABLED = 'true';
  process.env.PAYMENTS_MODE = 'simulated';
});

const PASSWORD = 'lozinka1234';

async function reader(email = 'citalac@test.local') {
  await User.create({ email, username: email.split('@')[0], passwordHash: await User.hashPassword(PASSWORD) });
  const res = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  return res.body.token;
}

async function staffToken() {
  await Staff.create({
    email: 'urednik@test.local', name: 'Urednik', role: 'admin',
    passwordHash: await Staff.hashPassword(PASSWORD)
  });
  const res = await api('/auth/staff/login', { method: 'POST', body: { email: 'urednik@test.local', password: PASSWORD } });
  return res.body.token;
}

async function makeSong() {
  const artist = await Artist.create({ name: 'Neko' });
  const song = await Song.create({
    title: 'Zakljucana', artist: artist._id, status: 'published',
    arrangements: [{
      label: 'Osnovna', originalKey: 'Am',
      content: ['[Am]red jedan', '[F]red dva', '[C]red tri', '[G]red cetiri',
                '[Am]red pet', '[F]red sest', '[C]red sedam'].join('\n')
    }]
  });
  return song.slug;
}

const linesOf = (s) => String(s || '').split('\n').filter((l) => l.trim()).length;

describe('paywall', () => {
  test('iskljucen gate vraca cijeli sadrzaj', async () => {
    process.env.PAYWALL_ENABLED = 'false';
    const slug = await makeSong();
    const res = await api(`/songs/${slug}`);
    assert.equal(res.body.song.locked, false);
    assert.equal(linesOf(res.body.song.content), 7);
  });

  test('neprijavljen ne dobija ni rijec ni akord, ali dobija oblik pjesme', async () => {
    const slug = await makeSong();
    const res = await api(`/songs/${slug}`);
    const content = res.body.song.content;

    assert.equal(res.body.song.locked, true);

    // The shape survives: same number of lines, so the page can show a sheet
    // that is recognisably a song rather than an empty box.
    assert.equal(linesOf(content), 7);

    // Nothing readable does. Asserted against the whole payload, not one field,
    // because the leak that got past an earlier version of this test was in a
    // property nobody thought to check.
    const whole = JSON.stringify(res.body);
    for (const chord of ['[Am]', '[F]', '[C]', '[G]']) {
      assert.ok(!whole.includes(chord), `akord ${chord} je poslan`);
    }
    for (const word of ['red jedan', 'red dva', 'red sedam']) {
      assert.ok(!whole.includes(word), `rijec "${word}" je poslana`);
    }
    assert.deepEqual(res.body.song.chords, []);
  });

  test('pretplatnik dobija tacno ono sto je upisano', async () => {
    // The other half of the same guarantee: masking must not survive payment.
    const token = await reader('platio@test.local');
    await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });

    const slug = await makeSong();
    const res = await api(`/songs/${slug}`, { token });

    assert.equal(res.body.song.locked, false);
    assert.ok(res.body.song.content.includes('[Am]red jedan'));
    assert.ok(res.body.song.content.includes('red sedam'));
    assert.ok(res.body.song.chords.length > 0);
  });

  test('akordi se ne salju uz zakljucan tekst', async () => {
    // Otherwise the chord strip hands over the answer the sheet withholds.
    // Asserted against the payload as a whole, not one field name: the first
    // version of this test checked `allChords`, which toPublic() never returns,
    // so it passed while the real `chords` list went out with every locked sheet.
    const slug = await makeSong();
    const res = await api(`/songs/${slug}`);

    assert.deepEqual(res.body.song.chords, []);
    for (const chord of ['Am', 'F', 'C', 'G']) {
      assert.ok(
        !JSON.stringify(res.body.song.chords || []).includes(chord),
        `akord ${chord} je poslan uz zakljucan list`
      );
    }
  });

  test('prijavljen bez pretplate je i dalje zakljucan', async () => {
    const token = await reader();
    const slug = await makeSong();
    const res = await api(`/songs/${slug}`, { token });
    assert.equal(res.body.song.locked, true);
  });

  test('pretplacen vidi sve', async () => {
    const token = await reader();
    const slug = await makeSong();

    const buy = await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });
    assert.equal(buy.status, 200);
    assert.equal(buy.body.subscription.active, true);

    const res = await api(`/songs/${slug}`, { token });
    assert.equal(res.body.song.locked, false);
    assert.equal(linesOf(res.body.song.content), 7);
  });

  test('osoblje ne mora placati katalog koji uredjuje', async () => {
    const token = await staffToken();
    const slug = await makeSong();
    const res = await api(`/songs/${slug}`, { token });
    assert.equal(res.body.song.locked, false);
  });
});

describe('zivotni vijek pretplate', () => {
  test('otkazivanje ne oduzima ono sto je placeno', async () => {
    const token = await reader();
    await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });

    const off = await api('/me/subscription', { method: 'DELETE', token });
    assert.equal(off.status, 200);
    assert.equal(off.body.subscription.status, 'cancelled');
    assert.equal(off.body.subscription.active, true, 'pristup je oduzet prije isteka');

    const slug = await makeSong();
    assert.equal((await api(`/songs/${slug}`, { token })).body.song.locked, false);
  });

  test('istekla pretplata vise ne vrijedi, ma sta status kaze', async () => {
    const token = await reader();
    await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });

    // status stays 'active'; only the date moves. expiresAt is the authority.
    await User.updateOne({ email: 'citalac@test.local' },
      { 'subscription.expiresAt': new Date(Date.now() - 1000) });

    const slug = await makeSong();
    assert.equal((await api(`/songs/${slug}`, { token })).body.song.locked, true);
  });

  test('obnova dodaje na preostalo, ne brise ga', async () => {
    const token = await reader();
    const first = await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });
    const second = await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });

    const a = new Date(first.body.subscription.expiresAt).getTime();
    const b = new Date(second.body.subscription.expiresAt).getTime();
    assert.ok(b > a + 29 * 864e5, 'druga uplata nije produzila nego zamijenila');
  });
});

describe('sigurnost simulacije', () => {
  test('bez prijave se ne moze pretplatiti', async () => {
    assert.equal((await api('/me/subscription', { method: 'POST', body: { plan: 'monthly' } })).status, 401);
  });

  test('nepoznat plan se odbija', async () => {
    const token = await reader();
    const res = await api('/me/subscription', { method: 'POST', token, body: { plan: 'zauvijek' } });
    assert.equal(res.status, 400);
  });

  test('van simulacije se pretplata ne poklanja', async () => {
    process.env.PAYMENTS_MODE = 'disabled';
    const token = await reader();
    const res = await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });
    assert.equal(res.status, 409);

    const slug = await makeSong();
    assert.equal((await api(`/songs/${slug}`, { token })).body.song.locked, true);
  });

  test('cjenovnik je javan', async () => {
    const res = await api('/plans');
    assert.equal(res.status, 200);
    assert.equal(res.body.plans.length, 2);
  });
});
