import { Router } from 'express';
import { list, create, vote, update } from '../controllers/requestController.js';
import { requireUser, requireStaff, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Anyone may see the queue and add to it; voting needs an account so the
// count means something.
router.get('/', optionalAuth, list);
router.post('/', optionalAuth, create);
router.post('/:id/vote', requireUser, vote);

router.patch('/:id', requireStaff, update);

export default router;
