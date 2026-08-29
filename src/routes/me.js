import { Router } from 'express';
import express from 'express';
import {
  listFavorites, addFavorite, removeFavorite,
  listFavoriteArtists, addFavoriteArtist, removeFavoriteArtist
} from '../controllers/meController.js';
import {
  getProfile, updateProfile, changeEmail, changePassword,
  uploadAvatar, deleteAvatar
} from '../controllers/profileController.js';
import { requireUser } from '../middleware/auth.js';
import {
  listPlans, mySubscription, simulateSubscribe, cancelSubscription
} from '../controllers/subscriptionController.js';
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

// Saved artists live beside saved songs but on their own path: "show me what
// they do next" and "I want to play this" are different acts.
router.get('/artists', listFavoriteArtists);
router.post('/artists/:artistId', addFavoriteArtist);
router.delete('/artists/:artistId', removeFavoriteArtist);

// Subscriptions. The plan list is public — a price nobody can read is not a
// price — while everything that changes an account needs the account.
router.get('/subscription', requireUser, mySubscription);
router.post('/subscription', requireUser, simulateSubscribe);
router.delete('/subscription', requireUser, cancelSubscription);

export default router;
