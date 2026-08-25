import express from 'express';
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
import meRoutes from './routes/me.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

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

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/genres', genreRoutes);
app.use('/api/import', importRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/footer', footerRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/me', meRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
