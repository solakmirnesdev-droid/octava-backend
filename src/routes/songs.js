import { Router } from 'express';
import { list, search, getOne, create, update, remove } from '../controllers/songController.js';
import { requireStaff, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// optionalAuth so editors see drafts while visitors see only published songs.
router.get('/', optionalAuth, list);
router.get('/search', optionalAuth, search);
router.get('/:identifier', optionalAuth, getOne);

router.post('/', requireStaff, requireRole('worker'), create);
router.put('/:identifier', requireStaff, requireRole('worker'), update);
router.delete('/:identifier', requireStaff, requireRole('admin'), remove);

export default router;
