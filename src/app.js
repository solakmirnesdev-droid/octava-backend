import express, { Router } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { sanitize } from './middleware/sanitize.js';
import authRoutes from './routes/auth.js';
import songRoutes from './routes/songs.js';
import artistRoutes from './routes/artists.js';
import genreRoutes from './routes/genres.js';
import importRoutes from './routes/import.js';
import requestRoutes from './routes/requests.js';
import footerRoutes from './routes/footer.js';
import versionRoutes from './routes/version.js';
import planRoutes from './routes/plans.js';
import statsRoutes from './routes/stats.js';
import accountRoutes from './routes/accounts.js';
import meRoutes from './routes/me.js';
import userRoutes from './routes/users.js';
import reviewRoutes from './routes/reviews.js';
import commentRoutes from './routes/comments.js';
import moderationRoutes from './routes/moderation.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import auditRoutes from './routes/audit.js';
import recognizeRoutes from './routes/recognize.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { publicLimiter, staffLimiter } from './middleware/rateLimit.js';

/**
 * Both are optional, and both fail open when unset — which is right for local
 * work and wrong in production. Saying so once at startup is the only thing
 * standing between "not configured yet" and "quietly unprotected for months".
 */
if (process.env.NODE_ENV === 'production') {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    console.warn('[startup] TURNSTILE_SECRET_KEY is not set — CAPTCHA is disabled.');
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn('[startup] GOOGLE_CLIENT_ID is not set — Google sign-in is unavailable.');
  }
}

const app = express();

// Behind a proxy the client address arrives in a header; without this every
// request looks like it comes from the proxy and rate limiting counts them
// all together.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:8000'],
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '256kb' }));

// After the body is parsed and before any route sees it. Schemas do the real
// refusing; this is the floor under the routes that do not have one yet.
app.use(sanitize);

/**
 * Health, checked rather than assumed.
 *
 * Returning ok unconditionally means a database outage stays invisible: the
 * load balancer keeps routing traffic to a process that fails every request.
 * A ping is cheap and is the difference between a failover and a silent outage.
 */
app.get('/api/health', async (_req, res) => {
  const state = mongoose.connection.readyState;

  if (state !== 1) {
    return res.status(503).json({ status: 'degraded', database: 'disconnected' });
  }

  try {
    const started = Date.now();
    await mongoose.connection.db.admin().command({ ping: 1 });
    res.json({ status: 'ok', database: 'connected', latencyMs: Date.now() - started });
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

/** Liveness: is the process up at all, regardless of its dependencies. */
app.get('/api/health/live', (_req, res) => res.json({ status: 'ok' }));
/**
 * A ceiling on volume for everything a signed-out visitor can reach. Search
 * runs a regex over the catalogue, which makes it the cheapest request to send
 * and one of the more expensive to answer.
 */
/*
 * The whole API, built once and mounted twice.
 *
 * AI-DECISION: /api/v1 exists for clients that ship separately from the server.
 * A phone app, once installed, is a frozen copy of this API's contract sitting
 * on somebody's device, and there is no way to make them update. The site and
 * the dashboard deploy alongside this server and can always speak the newest
 * shape, so they keep the unversioned path.
 *
 * The day something here has to change incompatibly, v1 stays as it is and v2
 * is mounted beside it. That is only possible if the prefix exists BEFORE the
 * first release — adding it afterwards is the one change an installed app
 * cannot survive.
 */
const api = Router();

api.use('/songs', publicLimiter);
api.use('/artists', publicLimiter);
api.use('/genres', publicLimiter);
api.use('/footer', publicLimiter);
api.use('/stats', publicLimiter);
// Fingerprint matching walks every stored print, so it is nearer in cost to
// search than to a lookup.
api.use('/recognize', publicLimiter);

/*
 * Reader-facing routes that were reachable without any ceiling at all: an
 * account, its saved songs, its reviews, its comments, its requests.
 */
api.use('/me', publicLimiter);
api.use('/users', publicLimiter);
api.use('/reviews', publicLimiter);
api.use('/comments', publicLimiter);
api.use('/requests', publicLimiter);
api.use('/reports', publicLimiter);

/* The desk. See staffLimiter for why these are not left open. */
api.use('/accounts', staffLimiter);
api.use('/moderation', staffLimiter);
api.use('/notifications', staffLimiter);
api.use('/import', staffLimiter);
api.use('/audit', staffLimiter);

api.use('/auth', authRoutes);
api.use('/songs', songRoutes);
api.use('/artists', artistRoutes);
api.use('/genres', genreRoutes);
api.use('/import', importRoutes);
api.use('/requests', requestRoutes);
api.use('/footer', footerRoutes);
// No limiter: a client asking whether it may still run must always get an
// answer, including — especially — when something is wrong.
api.use('/version', versionRoutes);
api.use('/plans', planRoutes);
api.use('/stats', statsRoutes);
api.use('/accounts', accountRoutes);
api.use('/me', meRoutes);
api.use('/users', userRoutes);
api.use('/reviews', reviewRoutes);
api.use('/comments', commentRoutes);
api.use('/moderation', moderationRoutes);
api.use('/notifications', notificationRoutes);
api.use('/reports', reportRoutes);
api.use('/audit', auditRoutes);
api.use('/recognize', recognizeRoutes);

// Pinned: what a released build on somebody's phone talks to.
app.use('/api/v1', api);
// Unversioned: the site and the dashboard ship with this server, so they always
// get the current shape. Keep this pointing at the newest version.
app.use('/api', api);


app.use(notFound);
app.use(errorHandler);

export default app;
