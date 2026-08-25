import { Router } from 'express';
import {
  register, login, logout, me,
  staffLogin, staffLogout, staffMe
} from '../controllers/authController.js';
import { requireUser, requireStaff } from '../middleware/auth.js';
import { loginLimiter, registerLimiter, authLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(authLimiter);

// Readers.
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', requireUser, me);

// Editors. Separate collection, separate cookie, separate token realm.
router.post('/staff/login', loginLimiter, staffLogin);
router.post('/staff/logout', staffLogout);
router.get('/staff/me', requireStaff, staffMe);

export default router;
