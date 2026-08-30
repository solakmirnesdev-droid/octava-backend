import { Server } from 'socket.io';
import ChatMessage from '../models/ChatMessage.js';
import Staff from '../models/Staff.js';
import { verifyToken, REALM_STAFF } from '../utils/jwt.js';

/**
 * The desk's chat, and who is at it.
 *
 * AI-DECISION: socket.io rather than raw WebSockets. What this needs beyond a
 * socket — reconnection with backoff, rooms to address one person, and a
 * fallback for networks that block upgrades — is most of what the library is,
 * and writing those three again is how a chat ends up silently not reconnecting
 * on a phone that changed networks.
 *
 * AI-TRAP: presence lives in this process's memory, exactly like the rate-limit
 * counters. On one instance that is correct and free. Behind two, each instance
 * sees only its own half of the desk and everybody looks half offline — the fix
 * then is the socket.io Redis adapter, not a bigger Map. Nothing here needs to
 * change first, but nothing here will warn you either.
 */

/**
 * A ceiling on how fast one account can write.
 *
 * AI-TRAP: express-rate-limit guards routes, and a socket event is not a route.
 * Every HTTP path into this application has a ceiling and `chat:send` had none,
 * so one authenticated account in a loop could write to the database as fast as
 * the network allowed — past every limit the API spent effort setting.
 *
 * Sized for a person having an argument, not for a person typing: thirty
 * messages a minute is roughly one every two seconds sustained, which nobody
 * reaches by hand and a loop passes instantly.
 */
const SEND_WINDOW_MS = 60 * 1000;

/**
 * AI-NOTE: overridable so the test can prove the ceiling with a handful of
 * messages instead of thirty-four. That is not tidiness — every message in a
 * socket test is a real round trip, and the suite that sent thirty-four of them
 * starved the other seventy-eight running beside it: twenty-five unrelated
 * tests timed out, all of them passing on their own. The behaviour under test
 * is "the limit holds", not "the limit is thirty".
 *
 * AI-TRAP: read when it is used, not when this module loads. ESM evaluates
 * every import before any module body, so a test setting the variable in its
 * own body sets it long after this file has already been evaluated — the same
 * ordering that server.js and config/env.js each carry a note about. As a
 * constant it silently kept the default and the test failed asserting five.
 */
const sendLimit = () => Number(process.env.CHAT_SEND_LIMIT) || 30;

/** staffId -> { count, resetAt } */
const sendRate = new Map();

function overSendLimit(id) {
  const now = Date.now();
  const bucket = sendRate.get(id);

  if (!bucket || now >= bucket.resetAt) {
    sendRate.set(id, { count: 1, resetAt: now + SEND_WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > sendLimit();
}

/** Dropped on disconnect so the map cannot grow with every account ever seen. */
const forgetRate = (id) => sendRate.delete(id);

/** staffId -> the sockets that account currently has open. */
const present = new Map();

const onlineIds = () => [...present.keys()];

function attach(id, socketId) {
  const existing = present.get(id);
  if (existing) {
    existing.add(socketId);
    // Already online; a second tab is not a state change worth broadcasting.
    return false;
  }
  present.set(id, new Set([socketId]));
  return true;
}

function detach(id, socketId) {
  const sockets = present.get(id);
  if (!sockets) return false;

  sockets.delete(socketId);
  if (sockets.size) return false;

  present.delete(id);
  return true;
}

/**
 * The live connection, kept so anything outside the chat can push to the desk.
 *
 * AI-TRAP: null until initChat runs, and it never runs under the test harness
 * or in a script. Every caller has to tolerate that — a notification failing to
 * reach a screen must never fail the action that raised it, exactly as
 * Notification.raise swallows its own errors.
 */
let live = null;

/** Sends an event to every connected staff socket. No-op when nobody is listening. */
export function pushToStaff(event, payload) {
  try {
    live?.emit(event, payload);
  } catch (err) {
    console.error('[realtime]', err.message);
  }
}

export function initChat(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      // Trimmed like the express side: "a, b" is how anybody writes a list, and
      // an origin with a leading space matches nothing while looking correct.
      origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean)
        || ['http://localhost:3000', 'http://localhost:8000'],
      credentials: true
    }
  });

  /**
   * The same door as requireStaff, on the way in rather than per request.
   *
   * AI-TRAP: a socket authenticates once and then stays open for hours, so the
   * checks a request makes every time cannot be assumed to still hold. A
   * deactivated account keeps its open socket until it disconnects — which is
   * why `active` is read again before every send below rather than trusted
   * from the handshake.
   */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));

      const payload = verifyToken(token, REALM_STAFF);
      const staff = await Staff.findById(payload.sub).select('name email role active');
      if (!staff || staff.active === false) return next(new Error('unauthorized'));

      socket.staff = { _id: String(staff._id), name: staff.name, email: staff.email, role: staff.role };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  /**
   * Is the token this socket handshook with still good?
   *
   * AI-TRAP: socket.io verifies credentials once, and the connection then lives
   * for as long as the network holds it. That was survivable while a staff
   * session lasted a week; it is not now that one lasts sixty idle minutes. An
   * open socket would have kept sending long after the session it was opened
   * with had expired — the idle timeout would apply to every screen except this
   * one, which is the screen somebody leaves open.
   *
   * Signature and expiry only: no database round trip, so this is far cheaper
   * than the two lookups the send already does. `active` is still read from the
   * database separately, because deactivation has to bite before the token runs
   * out rather than after it.
   */
  const tokenStillValid = (socket) => {
    try {
      verifyToken(socket.handshake.auth?.token, REALM_STAFF);
      return true;
    } catch {
      return false;
    }
  };

  io.on('connection', (socket) => {
    const me = socket.staff;

    // A room per account, not per socket: two tabs are one person, and a
    // message has to reach both without the sender knowing how many are open.
    socket.join(me._id);

    if (attach(me._id, socket.id)) {
      socket.broadcast.emit('presence:change', { staff: me._id, online: true });
    }
    socket.emit('presence:state', { online: onlineIds() });

    socket.on('chat:send', async (payload, ack) => {
      try {
        const to = String(payload?.to || '');
        const body = String(payload?.body || '').trim();

        if (!to || !body) return ack?.({ error: 'Prazna poruka.' });
        if (body.length > 4000) return ack?.({ error: 'Poruka je predugačka.' });
        if (to === me._id) return ack?.({ error: 'Ne možeš pisati sam sebi.' });

        if (overSendLimit(me._id)) {
          return ack?.({ error: 'Previše poruka. Sačekaj malo.' });
        }

        /*
         * Disconnected rather than merely refused: the client watches its token
         * and reconnects when the session guard renews one, so dropping the
         * socket is what puts a working session back. Answering "expired" while
         * holding the connection open leaves it in a state nothing recovers it
         * from.
         */
        if (!tokenStillValid(socket)) {
          ack?.({ error: 'Sesija je istekla. Prijavi se ponovo.' });
          return socket.disconnect(true);
        }

        const [sender, recipient] = await Promise.all([
          Staff.findById(me._id).select('active'),
          Staff.findById(to).select('active')
        ]);
        if (!sender?.active) return ack?.({ error: 'Nalog je deaktiviran.' });
        if (!recipient?.active) return ack?.({ error: 'Primalac više nije aktivan.' });

        const saved = await ChatMessage.create({
          from: me._id, to, pair: ChatMessage.pairOf(me._id, to), body
        });

        const message = {
          _id: saved._id, from: me._id, to,
          body: saved.body, createdAt: saved.createdAt, readAt: null
        };

        // To both rooms, so the sender's other tabs stay in step too.
        io.to(to).emit('chat:message', message);
        io.to(me._id).emit('chat:message', message);
        ack?.({ message });
      } catch {
        ack?.({ error: 'Slanje nije uspjelo.' });
      }
    });

    /** Marks a thread read and tells the other side their messages landed. */
    socket.on('chat:read', async (payload, ack) => {
      try {
        const withId = String(payload?.with || '');
        if (!withId) return ack?.({ error: 'Nedostaje sagovornik.' });

        const result = await ChatMessage.updateMany(
          { from: withId, to: me._id, readAt: null },
          { readAt: new Date() }
        );

        if (result.modifiedCount) {
          io.to(withId).emit('chat:read', { by: me._id, at: new Date() });
        }
        ack?.({ read: result.modifiedCount });
      } catch {
        ack?.({ error: 'Nije uspjelo.' });
      }
    });

    socket.on('disconnect', () => {
      if (detach(me._id, socket.id)) {
        socket.broadcast.emit('presence:change', { staff: me._id, online: false });
        forgetRate(me._id);
      }
    });
  });

  live = io;
  return io;
}

/** Read by the REST layer, so a page load knows who is here before the socket opens. */
export const whoIsOnline = () => onlineIds();
