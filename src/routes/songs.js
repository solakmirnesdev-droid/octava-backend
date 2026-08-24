import { Router } from 'express';
import { list, search, getOne, create, update, remove } from '../controllers/songController.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// optionalAuth so staff see drafts while visitors see only published songs.
router.get('/', optionalAuth, list);
router.get('/search', optionalAuth, search);
router.get('/:identifier', optionalAuth, getOne);

router.post('/', requireAuth, requireRole('worker'), create);
router.put('/:identifier', requireAuth, requireRole('worker'), update);
router.delete('/:identifier', requireAuth, requireRole('admin'), remove);

export default router;
