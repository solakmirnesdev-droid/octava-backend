import { Router } from 'express';
import {
  register, login, logout, me,
  staffLogin, staffLoginVerify, staffLogout, staffMe, staffResendEmailCode
} from '../controllers/authController.js';
import {
  setup, enable, disable, regenerateBackupCodes,
  emailSetup, emailEnable, emailDisable
} from '../controllers/twoFactorController.js';
import { forgot, reset } from '../controllers/resetController.js';
import { requireUser, requireStaff } from '../middleware/auth.js';
import { loginLimiter, registerLimiter, authLimiter, twoFactorLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  registerBody, loginBody, staffLoginBody, staffVerifyBody, challengeBody,
  googleBody, forgotBody, resetBody, codeBody, passwordBody, passwordCodeBody
} from '../middleware/schemas.js';
import { verifyTurnstile } from '../middleware/turnstile.js';
import { login as googleLogin, status as googleStatus } from '../controllers/googleController.js';

const router = Router();

router.use(authLimiter);

// Readers.
router.post('/register', registerLimiter, validate({ body: registerBody }), verifyTurnstile, register);
router.post('/login', loginLimiter, validate({ body: loginBody }), login);
router.post('/logout', logout);

// Whether to render the button, and the id the widget needs. Public: it is in
// the page source either way.
router.get('/google/status', googleStatus);
router.post('/google', loginLimiter, validate({ body: googleBody }), googleLogin);

// Throttled: this endpoint sends mail, so unlimited requests are both a way to
// spam an address and a way to burn a sending quota.
router.post('/forgot', registerLimiter, validate({ body: forgotBody }), verifyTurnstile, forgot);
router.post('/reset', loginLimiter, validate({ body: resetBody }), reset);
router.get('/me', requireUser, me);

// Editors. Separate collection, separate cookie, separate token realm.
router.post('/staff/login', loginLimiter, validate({ body: staffLoginBody }), staffLogin);
// Throttled too: this endpoint guards a six-digit secret, which is well
// within reach of a brute force if attempts are unlimited.
router.post('/staff/login/verify', twoFactorLimiter, validate({ body: staffVerifyBody }), staffLoginVerify);
// registerLimiter rather than the two-factor one: this sends mail, and the
// limit that matters here is the one that stops an address being buried and a
// free sending quota being burned — not the one that stops code guessing.
router.post('/staff/login/resend-code', registerLimiter, validate({ body: challengeBody }), staffResendEmailCode);
router.post('/staff/logout', staffLogout);
router.get('/staff/me', requireStaff, staffMe);

// Second factor management, all behind an existing session.
router.post('/staff/2fa/setup', requireStaff, setup);
router.post('/staff/2fa/enable', requireStaff, validate({ body: codeBody }), enable);
router.post('/staff/2fa/disable', requireStaff, validate({ body: passwordCodeBody }), disable);
router.post('/staff/2fa/backup-codes', requireStaff, validate({ body: passwordBody }), regenerateBackupCodes);

// Email as a second factor. Setup mails a code, so it is throttled as a sender;
// enable checks one, so it is throttled as a guess.
router.post('/staff/2fa/email/setup', requireStaff, registerLimiter, validate({ body: passwordBody }), emailSetup);
router.post('/staff/2fa/email/enable', requireStaff, twoFactorLimiter, validate({ body: codeBody }), emailEnable);
router.post('/staff/2fa/email/disable', requireStaff, validate({ body: passwordBody }), emailDisable);

export default router;
