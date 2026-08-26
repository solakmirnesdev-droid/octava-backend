import { Router } from 'express';
import { listReviews, listComments, moderateReview, moderateComment, counts }
  from '../controllers/moderationController.js';
import { requireStaff, requireRole } from '../middleware/auth.js';

/**
 * Moderation is an editor's job, not a worker's: hiding what a reader wrote is
 * a heavier decision than adding a song, and it is visible to that reader.
 */
const router = Router();
router.use(requireStaff, requireRole('admin'));

router.get('/counts', counts);
router.get('/reviews', listReviews);
router.get('/comments', listComments);
router.patch('/reviews/:id', moderateReview);
router.patch('/comments/:id', moderateComment);

export default router;
