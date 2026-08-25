import { Router } from 'express';
import { preview } from '../controllers/importController.js';
import { requireStaff, requireRole } from '../middleware/auth.js';

const router = Router();

// Editors only: this is an editing tool, not a public utility.
router.post('/preview', requireStaff, requireRole('worker'), preview);

export default router;
