import express, { Router } from 'express';
import { list, getOne } from '../controllers/artistController.js';
import { optionalAuth, requireStaff, requireRole } from '../middleware/auth.js';
import {
  create, update, remove, uploadImage, deleteImage, serveImage, MAX_IMAGE_BYTES
} from '../controllers/artistAdminController.js';
import { validate } from '../middleware/validate.js';
import { artistListQuery, slugParam } from '../middleware/schemas.js';

const router = Router();

router.get('/', validate({ query: artistListQuery }), list);
router.get('/:slug', validate({ params: slugParam }), optionalAuth, getOne);

// Public: the portrait is part of the page every visitor sees.
router.get('/:identifier/image', serveImage);

/**
 * Editing artists is a worker's job, same as adding a song.
 *
 * The picture arrives as a raw body rather than a multipart form: at a 10 KB
 * ceiling there is nothing to multiplex, and express.raw enforces both the
 * content type and the size before a byte reaches the handler.
 */
router.post('/', requireStaff, requireRole('worker'), create);
router.put('/:identifier', requireStaff, requireRole('worker'), update);
router.delete('/:identifier', requireStaff, requireRole('worker'), remove);

router.post(
  '/:identifier/image',
  requireStaff, requireRole('worker'),
  express.raw({ type: 'image/webp', limit: MAX_IMAGE_BYTES }),
  uploadImage
);
router.delete('/:identifier/image', requireStaff, requireRole('worker'), deleteImage);

export default router;
