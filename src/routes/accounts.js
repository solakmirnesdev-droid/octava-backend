import { Router } from 'express';
import { listUsers, listStaff, updateStaff } from '../controllers/accountController.js';
import { requireStaff, requireRole } from '../middleware/auth.js';

const router = Router();

// Other people's accounts are the highest-trust thing this system holds.
router.use(requireStaff, requireRole('superadmin'));

router.get('/users', listUsers);
router.get('/staff', listStaff);
router.patch('/staff/:id', updateStaff);

export default router;
