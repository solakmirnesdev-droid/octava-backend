import mongoose from 'mongoose';
import { slugify } from '../utils/slug.js';

/**
 * A song someone wants transcribed.
 *
 * Turns the content backlog into demand data: instead of guessing what to
 * transcribe next, the queue is ordered by how many people asked. Duplicates
 * are folded together on a normalised key rather than trusted to be typed
 * identically — "Aca Lukas" and "aca lukas" are the same request.
 */
const songRequestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    artist: { type: String, required: true, trim: true, maxlength: 120 },
    note: { type: String, trim: true, maxlength: 500 },

    /** De-accented "artist|title", unique, so re-requests become votes. */
    key: { type: String, required: true, unique: true, index: true },

    votes: { type: Number, default: 1, index: true },
    // Who has already voted, so one account cannot inflate a request.
    voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    status: {
      type: String,
      enum: ['open', 'in_progress', 'done', 'rejected'],
      default: 'open',
      index: true
    },
    // Set when an editor fulfils it, so the requester can be pointed at it.
    fulfilledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

songRequestSchema.statics.buildKey = (artist, title) =>
  `${slugify(artist)}|${slugify(title)}`;

songRequestSchema.pre('validate', function (next) {
  if (!this.key || this.isModified('title') || this.isModified('artist')) {
    this.key = this.constructor.buildKey(this.artist, this.title);
  }
  next();
});

export default mongoose.model('SongRequest', songRequestSchema);
