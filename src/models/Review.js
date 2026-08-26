import mongoose from 'mongoose';

/**
 * A reader's written opinion of a song.
 *
 * Deliberately not the same thing as a Rating. A rating answers "are these
 * chords right for this arrangement" — a narrow, checkable question. A review
 * answers "what do I think of this song", which is neither. Merging them would
 * make the accuracy average meaningless the first time someone one-starred a
 * correct chart because they dislike the singer.
 *
 * Reviews publish immediately and are hidden afterwards if needed, rather than
 * queued for approval: a catalogue this size cannot staff a queue, and a review
 * that appears three days late is a review nobody writes again.
 */
const reviewSchema = new mongoose.Schema(
  {
    song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    body: { type: String, required: true, trim: true, minlength: 3, maxlength: 4000 },

    /**
     * 'hidden' is moderation; 'removed' is the author deleting their own. They
     * are distinct so a hidden review cannot be resurrected by its author
     * editing it, and so the dashboard can tell the two apart.
     */
    status: {
      type: String,
      enum: ['published', 'hidden', 'removed'],
      default: 'published',
      index: true
    },

    /** Who hid it and why — a moderation record is worthless without both. */
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    moderationReason: { type: String, trim: true, maxlength: 500, default: '' },
    moderatedAt: { type: Date, default: null },

    /** Denormalised so a song page does not count comments per review. */
    commentCount: { type: Number, default: 0, min: 0 },

    editedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// One review per reader per song, enforced by the database rather than by a
// check in the handler, so a double submission cannot slip through a race.
reviewSchema.index({ song: 1, user: 1 }, { unique: true });

// The song page reads newest-first within one song; the dashboard reads
// newest-first across all of them.
reviewSchema.index({ song: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Review', reviewSchema);
