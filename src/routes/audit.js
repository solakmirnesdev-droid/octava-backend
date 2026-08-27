import { Router } from 'express';
import { list, facets } from '../controllers/auditController.js';
import { requireStaff, requireRole } from '../middleware/auth.js';

const router = Router();

// Admin and above. A worker seeing who reverted their edit is one thing; a
// worker reading every account change across the desk is another.
router.get('/', requireStaff, requireRole('admin'), list);
router.get('/facets', requireStaff, requireRole('admin'), facets);

export default router;
