import { Router } from 'express';
import { overview, songs, gaps } from '../controllers/statsController.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();

// Readership figures are an editorial concern, not a public one.
router.use(requireStaff);

router.get('/overview', overview);
router.get('/songs', songs);
// The one list on the page that says what to do rather than what happened.
router.get('/gaps', gaps);

export default router;
