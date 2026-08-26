import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import songRoutes from './routes/songs.js';
import artistRoutes from './routes/artists.js';
import genreRoutes from './routes/genres.js';
import importRoutes from './routes/import.js';
import requestRoutes from './routes/requests.js';
import footerRoutes from './routes/footer.js';
import statsRoutes from './routes/stats.js';
import accountRoutes from './routes/accounts.js';
import meRoutes from './routes/me.js';
import reviewRoutes from './routes/reviews.js';
import commentRoutes from './routes/comments.js';
import moderationRoutes from './routes/moderation.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { publicLimiter } from './middleware/rateLimit.js';

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
app.use('/api/songs', publicLimiter);
app.use('/api/artists', publicLimiter);
app.use('/api/genres', publicLimiter);
app.use('/api/footer', publicLimiter);
app.use('/api/stats', publicLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/genres', genreRoutes);
app.use('/api/import', importRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/footer', footerRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/me', meRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
