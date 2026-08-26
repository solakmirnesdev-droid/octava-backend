import mongoose from 'mongoose';

/**
 * Something that happened in the catalogue that staff should see.
 *
 * One row per event, shared by the whole desk, with read state kept per member
 * in `readBy`. The alternative — a copy per staff account — multiplies every
 * event by the size of the team and still has to be fanned out when someone new
 * is hired, for a desk that will realistically be two or three people.
 *
 * Notifications are a record of events, not a work queue: acting on one happens
 * on the review or request itself. Marking read here means "I have seen this",
 * never "this is handled".
 */
const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['review.created', 'comment.created', 'request.created', 'request.voted', 'report.created', 'user.registered'],
      required: true,
      index: true
    },

    /** Everything a dashboard row needs to render without a second query. */
    song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', default: null },
    review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: null },
    comment: { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewComment', default: null },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'SongRequest', default: null },
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'SongReport', default: null },

    /** The reader who caused it. Null for anything the system raises itself. */
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /**
     * A short, already-rendered summary. Kept because the thing a notification
     * points at can be deleted, and a row reading "review on (deleted)" is
     * worse than one that still says what was written.
     */
    summary: { type: String, trim: true, maxlength: 300, default: '' },

    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }]
  },
  { timestamps: true }
);

// The feed is newest-first; the unread badge counts rows this member is not in.
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ readBy: 1, createdAt: -1 });

/**
 * Raising a notification must never break the thing that caused it. A reader
 * posting a review does not care that the desk's feed failed to write, so this
 * swallows its own errors and reports rather than throwing.
 */
notificationSchema.statics.raise = async function raise(doc) {
  try {
    return await this.create(doc);
  } catch (err) {
    console.error('[notification]', err.message);
    return null;
  }
};

export default mongoose.model('Notification', notificationSchema);
