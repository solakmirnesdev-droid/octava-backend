import { Router } from 'express';
import { list, resolve } from '../controllers/reportController.js';
import { requireStaff, requireRole } from '../middleware/auth.js';

/**
 * The desk's queue of broken charts. Workers can see and close these — fixing a
 * chord is exactly their job, unlike hiding what a reader wrote.
 */
const router = Router();
router.use(requireStaff, requireRole('worker'));

router.get('/', list);
router.patch('/:id', resolve);

export default router;
