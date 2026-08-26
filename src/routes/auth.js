import { Router } from 'express';
import {
  register, login, logout, me,
  staffLogin, staffLoginVerify, staffLogout, staffMe
} from '../controllers/authController.js';
import {
  setup, enable, disable, regenerateBackupCodes
} from '../controllers/twoFactorController.js';
import { forgot, reset } from '../controllers/resetController.js';
import { requireUser, requireStaff } from '../middleware/auth.js';
import { loginLimiter, registerLimiter, authLimiter, twoFactorLimiter } from '../middleware/rateLimit.js';
import { verifyTurnstile } from '../middleware/turnstile.js';
import { login as googleLogin, status as googleStatus } from '../controllers/googleController.js';

const router = Router();

router.use(authLimiter);

// Readers.
router.post('/register', registerLimiter, verifyTurnstile, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);

// Whether to render the button, and the id the widget needs. Public: it is in
// the page source either way.
router.get('/google/status', googleStatus);
router.post('/google', loginLimiter, googleLogin);

// Throttled: this endpoint sends mail, so unlimited requests are both a way to
// spam an address and a way to burn a sending quota.
router.post('/forgot', registerLimiter, verifyTurnstile, forgot);
router.post('/reset', loginLimiter, reset);
router.get('/me', requireUser, me);

// Editors. Separate collection, separate cookie, separate token realm.
router.post('/staff/login', loginLimiter, staffLogin);
// Throttled too: this endpoint guards a six-digit secret, which is well
// within reach of a brute force if attempts are unlimited.
router.post('/staff/login/verify', twoFactorLimiter, staffLoginVerify);
router.post('/staff/logout', staffLogout);
router.get('/staff/me', requireStaff, staffMe);

// Second factor management, all behind an existing session.
router.post('/staff/2fa/setup', requireStaff, setup);
router.post('/staff/2fa/enable', requireStaff, enable);
router.post('/staff/2fa/disable', requireStaff, disable);
router.post('/staff/2fa/backup-codes', requireStaff, regenerateBackupCodes);

export default router;
