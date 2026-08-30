/**
 * First, and deliberately on its own line before every other import.
 *
 * ESM evaluates imports in order and all of them before this file's body, so
 * the previous `dotenv.config()` in the body ran only after the whole app graph
 * had been imported. Loading the environment as the first import is what makes
 * it available to everything that follows.
 */
import { env } from './src/config/env.js';

import http from 'node:http';
import mongoose from 'mongoose';
import app from './src/app.js';
import { connectDB } from './src/config/db.js';
import { initChat } from './src/realtime/chat.js';
import { startWatching } from './src/realtime/watch.js';

const PORT = env.PORT;

console.log(`✓ Okruženje: ${env.NODE_ENV}${env.envFile ? ` (${env.envFile})` : ' (bez .env fajla)'}`);

let server;
let io;

try {
  // Connect before listening, so the first request never races the database.
  await connectDB();

  /*
   * The HTTP server is built here rather than by app.listen(), because the
   * chat needs something to attach to. app.listen() creates one and keeps it,
   * leaving no handle for socket.io — and no handle for the shutdown below to
   * close either.
   */
  server = http.createServer(app);
  io = initChat(server);

  /*
   * Writes made by other processes — a fill script, the importer, a second
   * agent — never pass through this one, so the model hooks cannot see them.
   * This is what makes those visible on an open dashboard.
   */
  startWatching();

  server.listen(PORT, () => {
    console.log(`✓ Octava backend na http://localhost:${PORT}`);
  });
} catch (err) {
  console.error('Failed to start:', err.message);
  process.exit(1);
}

/**
 * Stop accepting connections, let in-flight requests finish, then close the
 * database. Without this every deploy cuts off whoever was mid-save.
 */
const SHUTDOWN_TIMEOUT_MS = 10000;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, shutting down…`);

  // A request that will not finish must not hold the process open forever.
  const forced = setTimeout(() => {
    console.error('Shutdown timed out; exiting anyway.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    /*
     * AI-TRAP: the chat has to be closed first, and explicitly. An open socket
     * is an open connection, so server.close() waits for every one of them —
     * which for a chat means forever, and every deploy would sit out the ten
     * second timeout above and then be killed mid-request anyway.
     */
    if (io) await io.close();

    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    await mongoose.connection.close(false);

    clearTimeout(forced);
    console.log('✓ Closed cleanly');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// An unhandled rejection leaves the process in an unknown state; crash so the
// supervisor restarts it rather than serving from a half-broken one.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});
