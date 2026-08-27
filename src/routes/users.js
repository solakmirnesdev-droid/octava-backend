import { Router } from 'express';
import { serveAvatar } from '../controllers/profileController.js';

const router = Router();

/*
 * The one public thing about somebody else's account.
 *
 * It hangs beside every review they have written, so it cannot sit behind a
 * session. Nothing else about the account is reachable here — no name, no
 * address, no list of what they have saved.
 */
router.get('/:id/avatar', serveAvatar);

export default router;
