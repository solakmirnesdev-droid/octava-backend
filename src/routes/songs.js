import { Router } from 'express';
import {
  list, search, getOne, create, update, remove, related,
  listTrash, restore, purge, bulk
} from '../controllers/songController.js';
import { rate, unrate, getRating } from '../controllers/ratingController.js';
import { listReviews, createReview } from '../controllers/reviewController.js';
import { create as createReport } from '../controllers/reportController.js';
import {
  add as addArrangement, update as updateArrangement,
  setPrimary as setPrimaryArrangement, remove as removeArrangement,
  restore as restoreArrangement, listRemoved as listRemovedArrangements
} from '../controllers/arrangementController.js';
import { contentLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { songListQuery, songSearchQuery, songDetailQuery, identifierParam } from '../middleware/schemas.js';
import { requireStaff, requireRole, optionalAuth, requireUser } from '../middleware/auth.js';

const router = Router();

// optionalAuth so editors see drafts while visitors see only published songs.
router.get('/', validate({ query: songListQuery }), optionalAuth, list);
router.get('/search', validate({ query: songSearchQuery }), optionalAuth, search);
// Before the generic :identifier handler would not matter here — this path is
// more specific — but it reads with the other song-scoped routes.
// AI-TRAP: before the generic /:identifier handler, or 'trash' is taken for a
// slug and the endpoint answers 404 for a route that exists.
router.get('/trash', requireStaff, requireRole('admin'), listTrash);

router.get('/:identifier/related', related);

router.get('/:identifier', validate({ params: identifierParam, query: songDetailQuery }), optionalAuth, getOne);

// Reading the average is public; casting a vote needs an account, or the
// number means nothing.
router.get('/:identifier/rating', optionalAuth, getRating);
router.post('/:identifier/rating', requireUser, rate);
router.delete('/:identifier/rating', requireUser, unrate);

// Reviews. Reading is public — they are part of what a visitor came to read —
// and writing is throttled per account, not per address, so one café does not
// share a quota.
router.get('/:identifier/reviews', optionalAuth, listReviews);
router.post('/:identifier/reviews', requireUser, contentLimiter, createReview);

// Reporting a broken chart needs an account: an anonymous report is one the
// desk cannot ask a follow-up question about.
router.post('/:identifier/report', requireUser, contentLimiter, createReport);

// Versions of a song. Editing chords is a worker's job, same as adding a song.
// AI-TRAP: before the /:arrangementId routes, or 'removed' is taken for an id.
router.get('/:identifier/arrangements/removed', requireStaff, requireRole('worker'), listRemovedArrangements);

router.post('/:identifier/arrangements', requireStaff, requireRole('worker'), addArrangement);
router.put('/:identifier/arrangements/:arrangementId', requireStaff, requireRole('worker'), updateArrangement);
router.patch('/:identifier/arrangements/:arrangementId/primary', requireStaff, requireRole('worker'), setPrimaryArrangement);
router.delete('/:identifier/arrangements/:arrangementId', requireStaff, requireRole('worker'), removeArrangement);
router.post('/:identifier/arrangements/:arrangementId/restore', requireStaff, requireRole('worker'), restoreArrangement);

router.post('/', requireStaff, requireRole('worker'), create);
router.put('/:identifier', requireStaff, requireRole('worker'), update);
// One edit across a selection. Worker-level: it is the same edits they can
// already make one at a time, only without the afternoon.
router.post('/bulk', requireStaff, requireRole('worker'), bulk);

router.delete('/:identifier', requireStaff, requireRole('admin'), remove);
router.post('/:identifier/restore', requireStaff, requireRole('admin'), restore);

// Purging is the only irreversible action left, so it sits with the top rank.
router.delete('/:identifier/purge', requireStaff, requireRole('superadmin'), purge);

export default router;
