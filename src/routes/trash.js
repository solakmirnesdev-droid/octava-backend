import { Router } from 'express';
import { empty, count } from '../controllers/trashController.js';
import { requireStaff, requireRole } from '../middleware/auth.js';

const router = Router();

// Reading what is in the trash is an admin's job; destroying it is not.
// Purging a single song and a single artist are both superadmin already, and
// doing three hundred at once is not a smaller act than doing one.
router.get('/count', requireStaff, requireRole('admin'), count);
router.delete('/', requireStaff, requireRole('superadmin'), empty);

export default router;
