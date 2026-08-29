import { Router } from 'express';
import express from 'express';
import { match, store, remove, list, offline } from '../controllers/recognizeController.js';
import { requireStaff, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * Fingerprints arrive as bytes, not JSON.
 *
 * The limits differ by an order of magnitude on purpose. A query is a few
 * seconds of microphone audio — a couple of hundred kilobytes at most — while a
 * whole song's print is around 400KB and a long live recording more. Sizing
 * them separately keeps the public endpoint from being an upload slot.
 */
const queryBody = express.raw({ type: 'application/octet-stream', limit: '1mb' });
const printBody = express.raw({ type: 'application/octet-stream', limit: '8mb' });

router.post('/', queryBody, match);
router.get('/offline', offline);

router.get('/', requireStaff, list);
router.put('/:songId', requireStaff, requireRole('worker'), printBody, store);
router.delete('/:songId', requireStaff, requireRole('admin'), remove);

export default router;
