import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import app from './src/app.js';
import { connectDB } from './src/config/db.js';

const PORT = process.env.PORT || 4000;

/**
 * Fail at startup, not at first use.
 *
 * A missing JWT_SECRET used to surface only when someone tried to sign in,
 * which means a broken deploy looks healthy until the first login attempt.
 */
const REQUIRED = ['MONGODB_URI', 'JWT_SECRET'];
const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length) {
  console.error('Missing required environment variables: ' + missing.join(', '));
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is too short for production. Use at least 32 characters.');
  process.exit(1);
}

let server;

try {
  // Connect before listening, so the first request never races the database.
  await connectDB();
  server = app.listen(PORT, () => {
    console.log(`✓ Octava backend running on http://localhost:${PORT}`);
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
