import { Router } from 'express';
import { listComments, createComment, removeReview, removeComment }
  from '../controllers/reviewController.js';
import { optionalAuth, requireUser } from '../middleware/auth.js';
import { contentLimiter } from '../middleware/rateLimit.js';

/**
 * Everything that hangs off a review rather than off a song. Creating a review
 * lives on the song route, because that is the thing it belongs to.
 */
const router = Router();

router.get('/:id/comments', optionalAuth, listComments);
router.post('/:id/comments', requireUser, contentLimiter, createComment);

// Authors take down their own; moderators use the moderation routes.
router.delete('/:id', requireUser, removeReview);

export default router;
