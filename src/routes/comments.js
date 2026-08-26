import { Router } from 'express';
import { removeComment } from '../controllers/reviewController.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
router.delete('/:id', requireUser, removeComment);
export default router;
