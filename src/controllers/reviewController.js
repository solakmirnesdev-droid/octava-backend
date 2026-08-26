import mongoose from 'mongoose';
import Review from '../models/Review.js';
import ReviewComment from '../models/ReviewComment.js';
import Notification from '../models/Notification.js';
import Song from '../models/Song.js';

/**
 * Reviews on songs, and the replies underneath them.
 *
 * A reader never hard-deletes: their own removal sets status 'removed' and a
 * moderator's sets 'hidden'. Rows stay because the unique index is what stops a
 * second review per song, and because a deleted row takes its replies' context
 * with it — a thread of answers to a question nobody can read any more.
 */

const findByIdOrSlug = (identifier) =>
  mongoose.isValidObjectId(identifier) ? { _id: identifier } : { slug: identifier };

/** Only ever expose the author's public identity, never their email. */
const AUTHOR_FIELDS = 'username';

/** Trims and rejects the empty string that a body of only spaces collapses to. */
function readBody(value, { max }) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function shapeReview(review, viewerId) {
  return {
    _id: review._id,
    body: review.body,
    author: review.user?.username || null,
    authorId: review.user?._id || review.user || null,
    commentCount: review.commentCount || 0,
    createdAt: review.createdAt,
    editedAt: review.editedAt,
    mine: viewerId ? String(review.user?._id || review.user) === String(viewerId) : false
  };
}

function shapeComment(comment, viewerId) {
  return {
    _id: comment._id,
    review: comment.review,
    body: comment.body,
    author: comment.user?.username || null,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    mine: viewerId ? String(comment.user?._id || comment.user) === String(viewerId) : false
  };
}

/* ------------------------------------------------------------------ reading */

export async function listReviews(req, res, next) {
  try {
    const song = await Song.findOne({ ...findByIdOrSlug(req.params.identifier), status: 'published' })
      .select('_id');
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const viewerId = req.user?._id;

    const filter = { song: song._id, status: 'published' };
    const [reviews, total, mine] = await Promise.all([
      Review.find(filter).populate('user', AUTHOR_FIELDS)
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Review.countDocuments(filter),
      // Surfaced separately so the author still sees their own review on page 2.
      viewerId ? Review.findOne({ song: song._id, user: viewerId, status: 'published' })
        .populate('user', AUTHOR_FIELDS) : null
    ]);

    res.json({
      items: reviews.map((r) => shapeReview(r, viewerId)),
      mine: mine ? shapeReview(mine, viewerId) : null,
      total,
      page,
      pages: Math.max(Math.ceil(total / limit), 1)
    });
  } catch (err) { next(err); }
}

export async function listComments(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Recenzija nije pronađena.' });
    }
    const comments = await ReviewComment.find({ review: req.params.id, status: 'published' })
      .populate('user', AUTHOR_FIELDS).sort({ createdAt: 1 }).limit(200);

    res.json({ items: comments.map((c) => shapeComment(c, req.user?._id)) });
  } catch (err) { next(err); }
}

/* ------------------------------------------------------------------ writing */

export async function createReview(req, res, next) {
  try {
    const body = readBody(req.body.body, { max: 4000 });
    if (!body || body.length < 3) {
      return res.status(400).json({ message: 'Recenzija mora imati između 3 i 4000 znakova.' });
    }

    const song = await Song.findOne({ ...findByIdOrSlug(req.params.identifier), status: 'published' })
      .select('_id title');
    if (!song) return res.status(404).json({ message: 'Pjesma nije pronađena.' });

    const existing = await Review.findOne({ song: song._id, user: req.user._id });
    if (existing && existing.status === 'hidden') {
      // Editing is not a way back from moderation.
      return res.status(403).json({ message: 'Tvoja recenzija je sakrivena.' });
    }
    if (existing) {
      existing.body = body;
      existing.status = 'published';
      existing.editedAt = new Date();
      await existing.save();
      await existing.populate('user', AUTHOR_FIELDS);
      return res.json({ review: shapeReview(existing, req.user._id) });
    }

    const review = await Review.create({ song: song._id, user: req.user._id, body });
    await review.populate('user', AUTHOR_FIELDS);

    await Notification.raise({
      type: 'review.created',
      song: song._id,
      review: review._id,
      actor: req.user._id,
      summary: `${req.user.username}: ${body.slice(0, 140)}`
    });

    res.status(201).json({ review: shapeReview(review, req.user._id) });
  } catch (err) {
    // The unique index is the real guard; a race lands here.
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Već si napisao recenziju za ovu pjesmu.' });
    }
    next(err);
  }
}

export async function removeReview(req, res, next) {
  try {
    const review = await Review.findById(req.params.id);
    if (!review || review.status === 'removed') {
      return res.status(404).json({ message: 'Recenzija nije pronađena.' });
    }
    if (String(review.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Nije tvoja recenzija.' });
    }

    review.status = 'removed';
    await review.save();
    // Replies go with it: they are answers to text that is no longer there.
    await ReviewComment.updateMany(
      { review: review._id, status: 'published' }, { status: 'removed' }
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function createComment(req, res, next) {
  try {
    const body = readBody(req.body.body, { max: 2000 });
    if (!body) return res.status(400).json({ message: 'Komentar mora imati između 1 i 2000 znakova.' });

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Recenzija nije pronađena.' });
    }
    const review = await Review.findOne({ _id: req.params.id, status: 'published' });
    if (!review) return res.status(404).json({ message: 'Recenzija nije pronađena.' });

    const comment = await ReviewComment.create({
      review: review._id, song: review.song, user: req.user._id, body
    });
    await comment.populate('user', AUTHOR_FIELDS);

    // Counted rather than recounted, for the same reason ratings are.
    await Review.updateOne({ _id: review._id }, { $inc: { commentCount: 1 } });

    await Notification.raise({
      type: 'comment.created',
      song: review.song,
      review: review._id,
      comment: comment._id,
      actor: req.user._id,
      summary: `${req.user.username}: ${body.slice(0, 140)}`
    });

    res.status(201).json({ comment: shapeComment(comment, req.user._id) });
  } catch (err) { next(err); }
}

export async function removeComment(req, res, next) {
  try {
    const comment = await ReviewComment.findById(req.params.id);
    if (!comment || comment.status === 'removed') {
      return res.status(404).json({ message: 'Komentar nije pronađen.' });
    }
    if (String(comment.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Nije tvoj komentar.' });
    }

    comment.status = 'removed';
    await comment.save();
    // Floored at zero: a count that went wrong once should not go negative and
    // stay wrong for good.
    await Review.updateOne(
      { _id: comment.review, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } }
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}
