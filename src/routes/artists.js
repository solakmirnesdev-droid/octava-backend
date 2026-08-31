import express, { Router } from 'express';
import { list, getOne, letterIndex, facets
} from '../controllers/artistController.js';
import { optionalAuth, requireStaff, requireRole } from '../middleware/auth.js';
import {
  create, update, remove, uploadImage, deleteImage, serveImage, MAX_IMAGE_BYTES,
  listTrash, restore, purge
} from '../controllers/artistAdminController.js';
import { validate } from '../middleware/validate.js';
import { artistListQuery, slugParam } from '../middleware/schemas.js';

const router = Router();

// Before the /:slug handler, like /trash, or 'facets' is read as a slug.
router.get('/facets', facets);

router.get('/', validate({ query: artistListQuery }), list);

// AI-TRAP: before the generic /:slug handler, or 'trash' is read as a slug and
// the bin returns 404 for an artist that does not exist. Same ordering the song
// routes already needed.
router.get('/trash', requireStaff, requireRole('admin'), listTrash);

// Also before /:slug, for the same reason. Public: it is the alphabet strip.
router.get('/index', letterIndex);

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

// Restoring is an admin's call and destroying is a superadmin's, matching the
// ladder the songs already use.
router.post('/:identifier/restore', requireStaff, requireRole('admin'), restore);
router.delete('/:identifier/purge', requireStaff, requireRole('superadmin'), purge);

router.post(
  '/:identifier/image',
  requireStaff, requireRole('worker'),
  express.raw({ type: 'image/webp', limit: MAX_IMAGE_BYTES }),
  uploadImage
);
router.delete('/:identifier/image', requireStaff, requireRole('worker'), deleteImage);

export default router;
