import { Router } from 'express';
import {
  register, login, logout, me,
  staffLogin, staffLogout, staffMe
} from '../controllers/authController.js';
import { requireUser, requireStaff } from '../middleware/auth.js';

const router = Router();

// Readers.
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireUser, me);

// Editors. Separate collection, separate cookie, separate token realm.
router.post('/staff/login', staffLogin);
router.post('/staff/logout', staffLogout);
router.get('/staff/me', requireStaff, staffMe);

export default router;
