import { Router } from 'express';
import { listFavorites, addFavorite, removeFavorite } from '../controllers/meController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/favorites', listFavorites);
router.post('/favorites/:songId', addFavorite);
router.delete('/favorites/:songId', removeFavorite);

export default router;
