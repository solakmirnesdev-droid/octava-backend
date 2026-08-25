import { Router } from 'express';
import { list, search, getOne, create, update, remove } from '../controllers/songController.js';
import { rate, unrate, getRating } from '../controllers/ratingController.js';
import { requireStaff, requireRole, optionalAuth, requireUser } from '../middleware/auth.js';

const router = Router();

// optionalAuth so editors see drafts while visitors see only published songs.
router.get('/', optionalAuth, list);
router.get('/search', optionalAuth, search);
router.get('/:identifier', optionalAuth, getOne);

// Reading the average is public; casting a vote needs an account, or the
// number means nothing.
router.get('/:identifier/rating', optionalAuth, getRating);
router.post('/:identifier/rating', requireUser, rate);
router.delete('/:identifier/rating', requireUser, unrate);

router.post('/', requireStaff, requireRole('worker'), create);
router.put('/:identifier', requireStaff, requireRole('worker'), update);
router.delete('/:identifier', requireStaff, requireRole('admin'), remove);

export default router;
