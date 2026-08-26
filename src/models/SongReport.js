import mongoose from 'mongoose';

/**
 * "These chords are wrong."
 *
 * The single most valuable thing a reader can tell us, and until now there was
 * no way to say it: /zatrazi covers songs that are missing, and a one-star
 * rating says something is off without saying what.
 *
 * A category plus a free note, because "wrong chord in the chorus" and "this is
 * in Am, not A" need different fixes and the category is what lets the desk
 * sort by that.
 */
const songReportSchema = new mongoose.Schema(
  {
    song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true, index: true },

    /** Which arrangement, when the song has more than one. */
    arrangement: { type: mongoose.Schema.Types.ObjectId, default: null },

    /** Required: an anonymous report is a report nobody can ask about. */
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    kind: {
      type: String,
      enum: ['chords', 'lyrics', 'key', 'duplicate', 'other'],
      required: true,
      index: true
    },

    note: { type: String, trim: true, maxlength: 1000, default: '' },

    status: {
      type: String,
      enum: ['open', 'resolved', 'rejected'],
      default: 'open',
      index: true
    },

    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    resolvedAt: { type: Date, default: null },
    resolution: { type: String, trim: true, maxlength: 500, default: '' }
  },
  { timestamps: true }
);

/**
 * One open report per reader per song. Someone who reports the same chart twice
 * has not found a second problem, and duplicates bury the queue. Resolved ones
 * are excluded, so a reader can report again if a fix did not take.
 */
songReportSchema.index(
  { song: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);

songReportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('SongReport', songReportSchema);
