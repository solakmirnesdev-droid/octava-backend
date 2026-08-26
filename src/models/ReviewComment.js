import mongoose from 'mongoose';

/**
 * A reply to a review.
 *
 * One level deep on purpose: threaded replies need collapsing, depth limits and
 * a "continue this thread" view, all of which is a lot of surface for a guitar
 * songbook. A flat list under each review is what the conversation actually
 * looks like here.
 */
const reviewCommentSchema = new mongoose.Schema(
  {
    review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true, index: true },

    /**
     * Denormalised from the review. The dashboard moderates comments across the
     * whole catalogue and needs the song without loading every parent review;
     * the app needs it to build a link back.
     */
    song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true, index: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },

    status: {
      type: String,
      enum: ['published', 'hidden', 'removed'],
      default: 'published',
      index: true
    },

    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    moderationReason: { type: String, trim: true, maxlength: 500, default: '' },
    moderatedAt: { type: Date, default: null },

    editedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Oldest-first within a review: a reply reads as an answer to what came before.
reviewCommentSchema.index({ review: 1, status: 1, createdAt: 1 });
reviewCommentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('ReviewComment', reviewCommentSchema);
