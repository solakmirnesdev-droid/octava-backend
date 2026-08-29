import { Router } from 'express';
import { listPlans } from '../controllers/subscriptionController.js';

const router = Router();

// Public: a price nobody can read before signing in is not a price.
router.get('/', listPlans);

export default router;
