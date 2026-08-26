import mongoose from 'mongoose';
import Review from '../models/Review.js';
import ReviewComment from '../models/ReviewComment.js';

/**
 * The moderation side of reviews, for the dashboard.
 *
 * Hiding is reversible and always recorded: who did it, when, and why. A desk
 * where one editor cannot see why another hid something ends up re-litigating
 * the same decision, so the reason is required rather than optional.
 *
 * Author removals ('removed') are visible here but not reversible by staff —
 * restoring text somebody deliberately took down is not moderation.
 *
 * AI-TRAP: staff carry `name`; only readers have `username`. Populating the
 * wrong one throws nothing — it returns the document without the field, so the
 * dashboard renders a blank moderator and the audit trail quietly says nobody
 * did it.
 */

const PAGE_MAX = 100;

function paging(query) {
  const limit = Math.min(Number(query.limit) || 25, PAGE_MAX);
  const page = Math.max(Number(query.page) || 1, 1);
  return { limit, skip: (page - 1) * limit, page };
}

/** status=all shows everything; anything else falls back to published. */
function statusFilter(value) {
  if (value === 'all') return {};
  if (['published', 'hidden', 'removed'].includes(value)) return { status: value };
  return { status: 'published' };
}

export async function listReviews(req, res, next) {
  try {
    const { limit, skip, page } = paging(req.query);
    const filter = statusFilter(req.query.status);

    const [items, total] = await Promise.all([
      Review.find(filter)
        .populate('user', 'username email')
        .populate('song', 'title slug')
        .populate('moderatedBy', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(limit),
      Review.countDocuments(filter)
    ]);

    res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) { next(err); }
}

export async function listComments(req, res, next) {
  try {
    const { limit, skip, page } = paging(req.query);
    const filter = statusFilter(req.query.status);

    const [items, total] = await Promise.all([
      ReviewComment.find(filter)
        .populate('user', 'username email')
        .populate('song', 'title slug')
        .populate('moderatedBy', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(limit),
      ReviewComment.countDocuments(filter)
    ]);

    res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) { next(err); }
}

/** Shared by both kinds: the moderation decision is identical either way. */
function moderate(Model, notFound) {
  return async function handler(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(404).json({ message: notFound });
      }

      const hide = req.body.hidden === true || req.body.hidden === 'true';
      const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

      if (hide && !reason) {
        return res.status(400).json({ message: 'Razlog je obavezan kad se sakriva.' });
      }

      const doc = await Model.findById(req.params.id);
      if (!doc) return res.status(404).json({ message: notFound });
      if (doc.status === 'removed') {
        return res.status(409).json({ message: 'Autor je ovo već uklonio.' });
      }

      doc.status = hide ? 'hidden' : 'published';
      doc.moderatedBy = req.staff._id;
      doc.moderationReason = hide ? reason.slice(0, 500) : '';
      doc.moderatedAt = new Date();
      await doc.save();

      res.json({ ok: true, status: doc.status });
    } catch (err) { next(err); }
  };
}

export const moderateReview = moderate(Review, 'Recenzija nije pronađena.');
export const moderateComment = moderate(ReviewComment, 'Komentar nije pronađen.');

/** Counts for the dashboard's own overview. */
export async function counts(_req, res, next) {
  try {
    const [reviews, hiddenReviews, comments, hiddenComments] = await Promise.all([
      Review.countDocuments({ status: 'published' }),
      Review.countDocuments({ status: 'hidden' }),
      ReviewComment.countDocuments({ status: 'published' }),
      ReviewComment.countDocuments({ status: 'hidden' })
    ]);
    res.json({ reviews, hiddenReviews, comments, hiddenComments });
  } catch (err) { next(err); }
}
