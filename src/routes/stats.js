import { Router } from 'express';
import { overview, songs } from '../controllers/statsController.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();

// Readership figures are an editorial concern, not a public one.
router.use(requireStaff);

router.get('/overview', overview);
router.get('/songs', songs);

export default router;
