import mongoose from 'mongoose';

/**
 * One reader's judgement of one arrangement.
 *
 * The vote belongs to the arrangement rather than the song: rating a song says
 * nothing about whether a particular chord chart is accurate, which is the only
 * question a reader can actually answer from the page in front of them.
 *
 * Stored as rows rather than only as a running total, so a rating can be
 * changed or withdrawn and the average recomputed from truth if it ever drifts.
 */
const ratingSchema = new mongoose.Schema(
  {
    song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true, index: true },
    arrangement: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    value: { type: Number, required: true, min: 1, max: 5 }
  },
  { timestamps: true }
);

// One vote per reader per arrangement. Enforced by the database rather than by
// a check in the handler, so a double submission cannot slip through a race.
ratingSchema.index({ arrangement: 1, user: 1 }, { unique: true });

export default mongoose.model('Rating', ratingSchema);
