import { Router } from 'express';
import {
  listUsers, listStaff, createStaff, updateStaff, grantSubscription
} from '../controllers/accountController.js';
import { requireStaff, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createStaffBody } from '../middleware/schemas.js';

const router = Router();

// Other people's accounts are the highest-trust thing this system holds.
router.use(requireStaff, requireRole('superadmin'));

router.get('/users', listUsers);
router.get('/staff', listStaff);
router.post('/staff', validate({ body: createStaffBody }), createStaff);
router.patch('/staff/:id', updateStaff);

// Superadmin, like everything else on this router — see the guard at the top.
router.post('/users/:id/subscription', grantSubscription);

export default router;
