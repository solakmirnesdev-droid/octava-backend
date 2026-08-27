import { Router } from 'express';
import express from 'express';
import { listFavorites, addFavorite, removeFavorite } from '../controllers/meController.js';
import {
  getProfile, updateProfile, changeEmail, changePassword,
  uploadAvatar, deleteAvatar
} from '../controllers/profileController.js';
import { requireUser } from '../middleware/auth.js';
import { contentLimiter } from '../middleware/rateLimit.js';
import { MAX_PORTRAIT_BYTES } from '../utils/webp.js';

const router = Router();

router.use(requireUser);

router.get('/', getProfile);
router.patch('/', updateProfile);

// Both credentials are throttled per account: these are the two endpoints worth
// grinding at if you have a session but not the password behind it.
router.patch('/email', contentLimiter, changeEmail);
router.patch('/password', contentLimiter, changePassword);

/*
 * The portrait arrives as a raw body rather than a multipart form: at a 10 KB
 * ceiling there is nothing to multiplex, and express.raw enforces both the type
 * and the size before a byte reaches the controller.
 */
router.post('/avatar', express.raw({ type: 'image/webp', limit: MAX_PORTRAIT_BYTES }), uploadAvatar);
router.delete('/avatar', deleteAvatar);

router.get('/favorites', listFavorites);
router.post('/favorites/:songId', addFavorite);
router.delete('/favorites/:songId', removeFavorite);

export default router;
