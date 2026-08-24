import mongoose from 'mongoose';
import { uniqueSlug } from '../utils/slug.js';

const artistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, index: true },
    bio: { type: String, maxlength: 2000 },
    imageUrl: String,
    genres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Genre', index: true }],
    songCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

artistSchema.pre('validate', async function (next) {
  if (!this.slug || this.isModified('name')) {
    this.slug = await uniqueSlug(this.constructor, this.name, this._id);
  }
  next();
});

/** Finds an artist by name, or creates one. Used when a worker types a name. */
artistSchema.statics.findOrCreateByName = async function (name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;

  const existing = await this.findOne({
    name: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  });

  return existing || this.create({ name: trimmed });
};

export default mongoose.model('Artist', artistSchema);
