import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as connect } from 'socket.io-client';
import { start, stop, reset, api } from './helpers.js';

/**
 * The chat, driven the way it is actually used: two clients, one socket each.
 *
 * AI-DECISION: this suite runs its own HTTP server rather than the one in
 * helpers.js. The shared harness calls app.listen(), which leaves no handle for
 * socket.io to attach to — the same reason server.js builds the server itself.
 * Testing the REST half alone would cover none of what the feature is.
 */

// Set before the socket layer is imported, which reads it once at module load.
process.env.CHAT_SEND_LIMIT = '5';
const LIMIT = 5;

let Staff, ChatMessage, initChat;
let httpServer, ioServer, url;

before(async () => {
  await start();
  ({ default: Staff } = await import('../src/models/Staff.js'));
  ({ default: ChatMessage } = await import('../src/models/ChatMessage.js'));
  ({ initChat } = await import('../src/realtime/chat.js'));
  const { default: app } = await import('../src/app.js');

  httpServer = http.createServer(app);
  ioServer = initChat(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  url = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  await ioServer.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await stop();
});

beforeEach(reset);

async function signIn(role, name) {
  const email = `${name}@test.local`;
  await Staff.create({
    email, name, role, passwordHash: await Staff.hashPassword('lozinka1234')
  });
  const res = await api('/auth/staff/login', {
    method: 'POST', body: { email, password: 'lozinka1234' }
  });
  const staff = await Staff.findOne({ email });
  return { token: res.body.token, id: String(staff._id), name };
}

/** Resolves once the socket is up, or rejects with the handshake's refusal. */
const open = (token) => new Promise((resolve, reject) => {
  const s = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  s.on('connect', () => resolve(s));
  s.on('connect_error', (err) => reject(err));
});

/*
 * AI-NOTE: eight seconds, not three. Every assertion here waits on a real
 * socket round trip, and on a loaded machine a three second ceiling failed ten
 * of thirteen tests once and none of them the next run — which is the worst
 * kind of red, because it teaches people to re-run instead of to look.
 */
const waitFor = (socket, event, ms = 8000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`nema '${event}' za ${ms}ms`)), ms);
  socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
});

describe('pristup', () => {
  test('bez tokena se ne moze spojiti', async () => {
    await assert.rejects(open(undefined), /unauthorized/);
  });

  test('istekao token prekida vec otvoren socket na slanju', async () => {
    /*
     * socket.io verifies credentials once, at the handshake, and the connection
     * then lives as long as the network holds it. A staff session lasts sixty
     * idle minutes, so without a second check the idle timeout would apply to
     * every screen except the one people leave open.
     *
     * So this opens a socket with a token that is still good, waits for it to
     * expire, and then sends — the case the handshake cannot see.
     */
    const jwt = (await import('jsonwebtoken')).default;
    const a = await signIn('worker', 'istekli');
    const b = await signIn('worker', 'prima');

    const shortLived = jwt.sign(
      { sub: a.id, realm: 'staff', role: 'worker' },
      process.env.JWT_SECRET,
      { expiresIn: '2s' }
    );

    const live = await open(shortLived);

    // Works while the token is good.
    const prije = await new Promise((resolve) => {
      live.emit('chat:send', { to: b.id, body: 'prije isteka' }, resolve);
    });
    assert.equal(prije.error, undefined, 'nije prosla ni dok je token vrijedio');

    await new Promise((r) => setTimeout(r, 2500));

    const poslije = await new Promise((resolve) => {
      live.emit('chat:send', { to: b.id, body: 'poslije isteka' }, resolve);
    });
    assert.match(poslije.error || '', /istekla/i, 'poruka je prosla s isteklim tokenom');

    // Dropped, not merely refused: the client reconnects when the session guard
    // renews, and that is what puts a working session back.
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(live.connected, false, 'socket je ostao otvoren s mrtvim tokenom');
    live.disconnect();

    assert.equal(await ChatMessage.countDocuments({ body: 'poslije isteka' }), 0);
  });

  test('izmisljen token se odbija', async () => {
    await assert.rejects(open('ovo.nije.token'), /unauthorized/);
  });

  test('deaktiviran nalog se ne moze spojiti', async () => {
    const a = await signIn('worker', 'ugasen');
    await Staff.updateOne({ _id: a.id }, { active: false });
    await assert.rejects(open(a.token), /unauthorized/);
  });
});

describe('prisutnost', () => {
  test('drugi vide kad neko dodje i kad ode', async () => {
    const a = await signIn('admin', 'ana');
    const b = await signIn('worker', 'bane');

    const first = await open(a.token);
    try {
      const arrival = waitFor(first, 'presence:change');
      const second = await open(b.token);

      assert.deepEqual(await arrival, { staff: b.id, online: true });

      const departure = waitFor(first, 'presence:change');
      second.disconnect();
      assert.deepEqual(await departure, { staff: b.id, online: false });
    } finally {
      first.disconnect();
    }
  });

  test('spisak prisutnih stize odmah po spajanju', async () => {
    const a = await signIn('admin', 'ana');
    const b = await signIn('worker', 'bane');

    const first = await open(a.token);
    try {
      const second = connect(url, { auth: { token: b.token }, transports: ['websocket'], reconnection: false });
      const state = await waitFor(second, 'presence:state');
      assert.ok(state.online.includes(a.id), 'prvi nije na spisku');
      second.disconnect();
    } finally {
      first.disconnect();
    }
  });

  /**
   * AI-TRAP: two tabs are one person. Closing one must not announce that they
   * left, or a colleague reads "offline" while they are still typing.
   */
  test('drugi tab ne javlja odlazak', async () => {
    const a = await signIn('admin', 'ana');
    const b = await signIn('worker', 'bane');

    const watcher = await open(a.token);
    try {
      const tabOne = await open(b.token);
      await waitFor(watcher, 'presence:change');

      const tabTwo = await open(b.token);
      let announced = false;
      watcher.on('presence:change', () => { announced = true; });

      tabTwo.disconnect();
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(announced, false, 'javljen odlazak dok je drugi tab jos otvoren');

      tabOne.disconnect();
    } finally {
      watcher.disconnect();
    }
  });
});

describe('poruke', () => {
  test('poruka stize primaocu i sprema se', async () => {
    const a = await signIn('admin', 'ana');
    const b = await signIn('worker', 'bane');

    const from = await open(a.token);
    const to = await open(b.token);

    try {
      const landing = waitFor(to, 'chat:message');
      from.emit('chat:send', { to: b.id, body: 'jesi li tu' });

      const message = await landing;
      assert.equal(message.body, 'jesi li tu');
      assert.equal(message.from, a.id);

      assert.equal(await ChatMessage.countDocuments({ pair: ChatMessage.pairOf(a.id, b.id) }), 1);
    } finally {
      from.disconnect();
      to.disconnect();
    }
  });

  test('posiljalac je vidi i u svom drugom tabu', async () => {
    const a = await signIn('admin', 'ana');
    const b = await signIn('worker', 'bane');

    const tabOne = await open(a.token);
    const tabTwo = await open(a.token);

    try {
      const echo = waitFor(tabTwo, 'chat:message');
      tabOne.emit('chat:send', { to: b.id, body: 'sa drugog uredjaja' });
      assert.equal((await echo).body, 'sa drugog uredjaja');
    } finally {
      tabOne.disconnect();
      tabTwo.disconnect();
    }
  });

  test('prazna poruka se odbija', async () => {
    const a = await signIn('admin', 'ana');
    const b = await signIn('worker', 'bane');
    const s = await open(a.token);

    try {
      const reply = await new Promise((r) => s.emit('chat:send', { to: b.id, body: '   ' }, r));
      assert.ok(reply.error);
      assert.equal(await ChatMessage.countDocuments(), 0);
    } finally {
      s.disconnect();
    }
  });

  test('ne moze se pisati samom sebi', async () => {
    const a = await signIn('admin', 'ana');
    const s = await open(a.token);
    try {
      const reply = await new Promise((r) => s.emit('chat:send', { to: a.id, body: 'zdravo ja' }, r));
      assert.ok(reply.error);
    } finally {
      s.disconnect();
    }
  });

  /**
   * AI-TRAP: a socket authenticates once and stays open for hours. Deactivating
   * an account has to take effect on the next message, not on the next login.
   */
  test('deaktiviran nalog vise ne moze slati preko vec otvorenog socketa', async () => {
    const a = await signIn('admin', 'ana');
    const b = await signIn('worker', 'bane');
    const s = await open(a.token);

    try {
      await Staff.updateOne({ _id: a.id }, { active: false });
      const reply = await new Promise((r) => s.emit('chat:send', { to: b.id, body: 'jos sam tu' }, r));
      assert.ok(reply.error, 'deaktiviran nalog je poslao poruku');
      assert.equal(await ChatMessage.countDocuments(), 0);
    } finally {
      s.disconnect();
    }
  });
});

describe('ogranicenje slanja', () => {
  /**
   * AI-TRAP: express-rate-limit guards routes, and a socket event is not one.
   * Without this ceiling an authenticated account in a loop writes to the
   * database as fast as the network allows, past every limit the API sets.
   */
  test('poplava se zaustavlja, i baza ne primi visak', async () => {
    const a = await signIn('worker', 'brzi');
    const b = await signIn('admin', 'meta');
    const s = await open(a.token);

    try {
      const replies = [];
      for (let i = 0; i < LIMIT + 3; i++) {
        replies.push(await new Promise((r) => s.emit('chat:send', { to: b.id, body: 'p' + i }, r)));
      }

      const accepted = replies.filter((r) => !r.error).length;
      const refused = replies.filter((r) => r.error).length;

      assert.equal(accepted, LIMIT, `propusteno ${accepted}, ocekivano ${LIMIT}`);
      assert.equal(refused, 3);
      assert.equal(await ChatMessage.countDocuments(), LIMIT, 'baza je primila vise nego sto je propusteno');
    } finally {
      s.disconnect();
    }
  });

  test('ogranicenje je po nalogu, ne po svima', async () => {
    const a = await signIn('worker', 'prvi');
    const b = await signIn('worker', 'drugi');
    const c = await signIn('admin', 'primalac');

    const sa = await open(a.token);
    const sb = await open(b.token);

    try {
      for (let i = 0; i < LIMIT + 1; i++) {
        await new Promise((r) => sa.emit('chat:send', { to: c.id, body: 'x' + i }, r));
      }
      // The first account is now blocked; the second must be untouched by it.
      const reply = await new Promise((r) => sb.emit('chat:send', { to: c.id, body: 'ja tek pocinjem' }, r));
      assert.ok(!reply.error, 'drugi nalog zakljucan zbog prvog: ' + reply.error);
    } finally {
      sa.disconnect();
      sb.disconnect();
    }
  });
});

describe('citanje', () => {
  test('otvaranje razgovora javlja posiljaocu da je proicitano', async () => {
    const a = await signIn('admin', 'ana');
    const b = await signIn('worker', 'bane');

    const from = await open(a.token);
    const to = await open(b.token);

    try {
      const landed = waitFor(to, 'chat:message');
      from.emit('chat:send', { to: b.id, body: 'procitaj ovo' });
      await landed;

      const receipt = waitFor(from, 'chat:read');
      to.emit('chat:read', { with: a.id });

      assert.equal((await receipt).by, b.id);
      assert.equal(await ChatMessage.countDocuments({ to: b.id, readAt: null }), 0);
    } finally {
      from.disconnect();
      to.disconnect();
    }
  });

  test('nepricitane se broje po sagovorniku', async () => {
    const a = await signIn('admin', 'ana');
    const b = await signIn('worker', 'bane');
    const from = await open(a.token);

    try {
      for (const body of ['prva', 'druga']) {
        await new Promise((r) => from.emit('chat:send', { to: b.id, body }, r));
      }
      const res = await api('/chat/peers', { token: b.token });
      const peer = res.body.peers.find((p) => p._id === a.id);
      assert.equal(peer.unread, 2);
      assert.equal(peer.last.body, 'druga');
    } finally {
      from.disconnect();
    }
  });
});
