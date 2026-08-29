import mongoose from 'mongoose';
import { ENTRY_BYTES, FINGERPRINT_VERSION } from '../utils/fingerprint.js';

/**
 * One song's acoustic fingerprint.
 *
 * AI-DECISION: the audio itself is never stored, and never uploaded. The
 * browser decodes the file, computes the constellation and sends only the
 * packed hash pairs — so what lives here is a few hundred kilobytes of integers
 * from which no recording can be reconstructed and none needs to be. That is
 * both the licensing answer and the reason indexing costs nothing to host.
 * See AI-NOTES.md §5.
 */
const audioPrintSchema = new mongoose.Schema(
  {
    song: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Song',
      required: true,
      unique: true,
      index: true
    },

    /**
     * Packed pairs, six bytes each. See utils/fingerprint.js for the layout.
     *
     * `select: false` for the same reason Artist.image is: a four minute song
     * is most of a megabyte, and every list query that forgot to exclude it
     * would drag the whole index across the wire.
     */
    hashes: { type: Buffer, required: true, select: false },

    /** Kept alongside so a listing can show the size without loading the bytes. */
    hashCount: { type: Number, required: true },
    seconds: { type: Number, required: true },

    /**
     * AI-TRAP: a print is only comparable to a query from the same algorithm.
     * Stored rather than assumed, so a bumped FINGERPRINT_VERSION shows up as
     * "this print is stale" instead of as a song that quietly never matches.
     */
    version: { type: Number, required: true, default: FINGERPRINT_VERSION },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }
  },
  { timestamps: true }
);

/** Prints from an older algorithm are dead weight; matching must skip them. */
audioPrintSchema.statics.current = function current(filter = {}) {
  return this.find({ ...filter, version: FINGERPRINT_VERSION });
};

audioPrintSchema.pre('validate', function (next) {
  if (this.hashes && this.hashes.length % ENTRY_BYTES !== 0) {
    return next(new Error(`Otisak mora biti djeljiv sa ${ENTRY_BYTES} bajta.`));
  }
  next();
});

export default mongoose.model('AudioPrint', audioPrintSchema);
