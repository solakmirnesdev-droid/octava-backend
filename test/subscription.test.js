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
  test('a disabled gate returns the whole content', async () => {
    process.env.PAYWALL_ENABLED = 'false';
    const slug = await makeSong();
    const res = await api(`/songs/${slug}`);
    assert.equal(res.body.song.locked, false);
    assert.equal(linesOf(res.body.song.content), 7);
  });

  /*
   * The guarantee changed shape in 2026-08: a locked sheet now opens with a
   * real lead-in and withholds the rest, because masking the whole thing left
   * Google indexing 1569 pages of dots and filler. What must still hold is that
   * everything past the lead-in is unreadable — so these assert the seam, which
   * is the part that can now leak.
   */
  /*
   * The rule, stated plainly: the backend does not deliver text or chords to a
   * visitor who is not signed in. Not a shortened version, not a first verse —
   * nothing readable. The blur on the page is decoration; this is the lock.
   */
  test('a signed-out visitor gets neither a word nor a chord', async () => {
    const slug = await makeSong();
    const res = await api(`/songs/${slug}`);

    assert.equal(res.body.song.locked, true);

    // The shape survives: same number of lines, so the page still shows a sheet
    // that is recognisably a song rather than an empty box.
    assert.equal(linesOf(res.body.song.content), 7);

    /*
     * Asserted against the whole payload, not one field: the leak that got past
     * an earlier version of this test was in a property nobody thought to check.
     */
    const whole = JSON.stringify(res.body);
    for (const chord of ['[Am]', '[F]', '[C]', '[G]']) {
      assert.ok(!whole.includes(chord), `akord ${chord} je poslan`);
    }
    for (const word of ['red jedan', 'red dva', 'red sedam']) {
      assert.ok(!whole.includes(word), `rijec "${word}" je poslana`);
    }
    assert.deepEqual(res.body.song.chords, []);
  });

  test('chords come out as [X], letters as x, the shape stays', async () => {
    // Masking rather than omitting is the whole point: word lengths and
    // punctuation survive, the words do not.
    const artist = await Artist.create({ name: 'Oblik' });
    const song = await Song.create({
      title: 'Mujo', artist: artist._id, status: 'published',
      arrangements: [{
        label: 'Osnovna', originalKey: 'Am',
        content: '[Strofa 1]\n[Am]Mujo kuje a majka ga [Dm]kune'
      }]
    });

    const { body } = await api(`/songs/${song.slug}`);
    const lines = body.song.content.split('\n');

    // Section markers are structure, not content, and stay legible.
    assert.equal(lines[0], '[Strofa 1]');
    assert.equal(lines[1], '[X]xxxx xxxx x xxxxx xx [X]xxxx');
  });

  test('a masked sheet keeps its sections but not one word', async () => {
    const artist = await Artist.create({ name: 'Oznaceni' });
    const song = await Song.create({
      title: 'Sa sekcijama', artist: artist._id, status: 'published',
      arrangements: [{
        label: 'Osnovna', originalKey: 'Am',
        content: [
          '[Strofa 1]', '[Am]prvi red', '[F]drugi red',
          '[Refren]', '[G]refren jedan', '[Am]refren dva'
        ].join('\n')
      }]
    });

    const { body } = await api(`/songs/${song.slug}`);
    const whole = JSON.stringify(body);

    assert.ok(body.song.content.includes('[Strofa 1]'));
    assert.ok(body.song.content.includes('[Refren]'));

    for (const withheld of ['prvi red', 'drugi red', 'refren jedan', 'refren dva']) {
      assert.ok(!whole.includes(withheld), `"${withheld}" je poslano`);
    }
  });

  test('a sheet with no chords is not locked', async () => {
    /*
     * 594 songs carry only "Tekst još uvijek nije ažuriran." while they wait to
     * be written up. Masking that sentence produced "xxxxx xxx xxxxxx xxxx
     * xxxxxxxx." and the page then offered to sell what was behind it — which
     * was nothing at all.
     */
    const artist = await Artist.create({ name: 'Prazna' });
    const song = await Song.create({
      title: 'Ceka tekst', artist: artist._id, status: 'published',
      arrangements: [{ label: 'Osnovna', originalKey: 'Am', content: 'Tekst još uvijek nije ažuriran.' }]
    });

    const { body } = await api(`/songs/${song.slug}`);
    assert.equal(body.song.locked, false);
    assert.equal(body.song.content, 'Tekst još uvijek nije ažuriran.');
  });

  test('a subscriber gets exactly what was written', async () => {
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

  test('stripping chords gives nothing away', async () => {
    // Otherwise the strip under the sheet hands over, in a neat list, exactly
    // what the sheet is hiding — the chords are the product here, not the words.
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

  /*
   * The wall asks for an account, not a payment — PAYWALL_REQUIRES=account,
   * which is the default and what is running now. Payments are not designed
   * yet, so signing in is the whole price. The subscription path is still
   * exercised below, with the setting flipped, so it cannot rot while it is
   * switched off.
   */
  test('signing in is enough while the wall asks for an account', async () => {
    const token = await reader();
    const slug = await makeSong();
    const res = await api(`/songs/${slug}`, { token });

    assert.equal(res.body.song.locked, false);
    assert.ok(res.body.song.content.includes('[Am]red jedan'));
    assert.ok(res.body.song.chords.length > 0);
  });

  test('when the wall asks for a subscription, signing in alone is not enough', async () => {
    process.env.PAYWALL_REQUIRES = 'subscription';
    try {
      const token = await reader();
      const slug = await makeSong();
      assert.equal((await api(`/songs/${slug}`, { token })).body.song.locked, true);
    } finally {
      process.env.PAYWALL_REQUIRES = 'account';
    }
  });

  test('a subscriber sees everything', async () => {
    const token = await reader();
    const slug = await makeSong();

    const buy = await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });
    assert.equal(buy.status, 200);
    assert.equal(buy.body.subscription.active, true);

    const res = await api(`/songs/${slug}`, { token });
    assert.equal(res.body.song.locked, false);
    assert.equal(linesOf(res.body.song.content), 7);
  });

  test('staff do not pay for the catalogue they edit', async () => {
    const token = await staffToken();
    const slug = await makeSong();
    const res = await api(`/songs/${slug}`, { token });
    assert.equal(res.body.song.locked, false);
  });
});

describe('subscription lifetime', () => {
  test('cancelling does not take away what was paid for', async () => {
    const token = await reader();
    await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });

    const off = await api('/me/subscription', { method: 'DELETE', token });
    assert.equal(off.status, 200);
    assert.equal(off.body.subscription.status, 'cancelled');
    assert.equal(off.body.subscription.active, true, 'pristup je oduzet prije isteka');

    const slug = await makeSong();
    assert.equal((await api(`/songs/${slug}`, { token })).body.song.locked, false);
  });

  test('an expired subscription no longer counts, whatever the status says', async () => {
    // Only meaningful while the wall asks for payment.
    process.env.PAYWALL_REQUIRES = 'subscription';
    const token = await reader();
    await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });

    // status stays 'active'; only the date moves. expiresAt is the authority.
    await User.updateOne({ email: 'citalac@test.local' },
      { 'subscription.expiresAt': new Date(Date.now() - 1000) });

    const slug = await makeSong();
    assert.equal((await api(`/songs/${slug}`, { token })).body.song.locked, true);
    process.env.PAYWALL_REQUIRES = 'account';
  });

  test('renewal adds to what is left, it does not erase it', async () => {
    const token = await reader();
    const first = await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });
    const second = await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });

    const a = new Date(first.body.subscription.expiresAt).getTime();
    const b = new Date(second.body.subscription.expiresAt).getTime();
    assert.ok(b > a + 29 * 864e5, 'druga uplata nije produzila nego zamijenila');
  });
});

describe('simulation safety', () => {
  test('subscribing requires signing in', async () => {
    assert.equal((await api('/me/subscription', { method: 'POST', body: { plan: 'monthly' } })).status, 401);
  });

  test('an unknown plan is refused', async () => {
    const token = await reader();
    const res = await api('/me/subscription', { method: 'POST', token, body: { plan: 'zauvijek' } });
    assert.equal(res.status, 400);
  });

  test('outside simulation a subscription is not given away', async () => {
    // Only meaningful while the wall asks for payment.
    process.env.PAYWALL_REQUIRES = 'subscription';
    process.env.PAYMENTS_MODE = 'disabled';
    const token = await reader();
    const res = await api('/me/subscription', { method: 'POST', token, body: { plan: 'monthly' } });
    assert.equal(res.status, 409);

    const slug = await makeSong();
    assert.equal((await api(`/songs/${slug}`, { token })).body.song.locked, true);
    process.env.PAYWALL_REQUIRES = 'account';
  });

  test('the price list is public', async () => {
    const res = await api('/plans');
    assert.equal(res.status, 200);
    assert.equal(res.body.plans.length, 2);
  });
});
