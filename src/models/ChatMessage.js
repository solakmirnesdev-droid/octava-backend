import mongoose from 'mongoose';

/**
 * One message between two members of the desk.
 *
 * AI-DECISION: persisted rather than kept in the socket layer. A chat that
 * lives only in memory loses everything on a deploy, and the desk uses this to
 * hand work over — "I left Bijelo Dugme half done" has to survive a restart or
 * it is not a handover, it is a notification.
 */
const chatMessageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },

    /**
     * Both ids, sorted and joined.
     *
     * AI-DECISION: a conversation is otherwise `$or: [{from: a, to: b}, {from: b, to: a}]`,
     * which no compound index serves well. Storing the pair makes fetching a
     * thread a single indexed lookup, and sorting the two ids is what makes the
     * key the same whichever direction the message went.
     */
    pair: { type: String, required: true, index: true },

    body: { type: String, required: true, trim: true, maxlength: 4000 },

    /** When the recipient opened the thread, not when it was delivered. */
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// The one question a thread asks: this conversation, newest last.
chatMessageSchema.index({ pair: 1, createdAt: 1 });
// And the one the peer list asks: what have I not read.
chatMessageSchema.index({ to: 1, readAt: 1 });

/** Same key from either side. */
chatMessageSchema.statics.pairOf = (a, b) => [String(a), String(b)].sort().join(':');

export default mongoose.model('ChatMessage', chatMessageSchema);
