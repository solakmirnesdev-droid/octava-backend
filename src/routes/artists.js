import { Router } from 'express';
import { list, getOne } from '../controllers/artistController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', list);
router.get('/:slug', optionalAuth, getOne);

export default router;
