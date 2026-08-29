import { Router } from 'express';
import { peers, thread } from '../controllers/chatController.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();

// The desk talking among itself. No rank gate beyond being staff at all:
// a worker who cannot reach an admin has no way to ask about the thing they
// are not allowed to do.
router.use(requireStaff);

router.get('/peers', peers);
router.get('/with/:staffId', thread);

export default router;
