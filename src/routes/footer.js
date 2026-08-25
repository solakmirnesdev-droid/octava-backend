import { Router } from 'express';
import { footer } from '../controllers/footerController.js';

const router = Router();
router.get('/', footer);

export default router;
