import mongoose from 'mongoose';
import { uniqueSlug } from '../utils/slug.js';

/**
 * A browsable rubric. Deliberately one flat list rather than two hierarchies:
 * "domaća" is a region and "pop" is a style, but a song is routinely both, so
 * modelling them as separate axes would double every filter for no gain.
 * `kind` keeps them groupable in the UI without splitting the data model.
 */
const genreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, maxlength: 500 },

    kind: {
      type: String,
      enum: ['region', 'style', 'era'],
      default: 'style',
      index: true
    },

    // Controls display order; ties fall back to name.
    order: { type: Number, default: 100 },
    songCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

genreSchema.pre('validate', async function (next) {
  if (!this.slug || this.isModified('name')) {
    this.slug = await uniqueSlug(this.constructor, this.name, this._id);
  }
  next();
});

export default mongoose.model('Genre', genreSchema);
