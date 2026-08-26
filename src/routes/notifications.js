import { Router } from 'express';
import { list, unreadCount, markRead } from '../controllers/notificationController.js';
import { requireStaff } from '../middleware/auth.js';

/**
 * Readable by anyone on the desk, including workers: knowing what is happening
 * in the catalogue is not a privileged act, and a worker who cannot see a new
 * review has no reason to go looking for one.
 */
const router = Router();
router.use(requireStaff);

router.get('/', list);
router.get('/unread-count', unreadCount);
router.post('/read', markRead);

export default router;
