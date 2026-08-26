import mongoose from 'mongoose';
import { uniqueSlug, slugify } from '../utils/slug.js';

const artistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, index: true },

    /** De-accented lowercase name; see Song.searchTitle for why. */
    searchName: { type: String, index: true },
    bio: { type: String, maxlength: 2000 },

    /**
     * A portrait, kept in the database rather than on disk.
     *
     * At a 10 KB ceiling the whole roster is under two megabytes, and the
     * encrypted nightly backup already covers the database — files on disk
     * would need a second backup path that does not exist. `select: false`
     * keeps the bytes out of every list query; the image is served by its own
     * route.
     */
    image: { type: Buffer, select: false },
    imageType: { type: String, enum: ['image/webp'], default: undefined },
    imageBytes: { type: Number, default: 0 },
    imageUpdatedAt: { type: Date, default: null },

    /** Kept for artists whose picture lives somewhere else entirely. */
    imageUrl: String,

    /**
     * ISO 3166-1 alpha-2. Stored as the code rather than the flag, because the
     * code is what sorts, filters and survives a font that cannot draw flags —
     * the emoji is derived from it at the edge.
     */
    country: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{2}$/, 'Zemlja mora biti dvoslovna oznaka (npr. BA).'],
      default: undefined
    },
    genres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Genre', index: true }],
    songCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

artistSchema.pre('validate', async function (next) {
  if (!this.slug || this.isModified('name')) {
    this.slug = await uniqueSlug(this.constructor, this.name, this._id);
  }

  if (this.isModified('name') || !this.searchName) {
    this.searchName = slugify(this.name).replace(/-/g, ' ');
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


/**
 * The flag, built from the country code.
 *
 * Regional indicator symbols sit at a fixed offset from A-Z, so BA becomes the
 * two code points that a font renders as one flag. Nothing is stored: a country
 * has exactly one flag and duplicating it invites the two to disagree.
 */
artistSchema.methods.flag = function flag() {
  if (!this.country) return null;
  return String.fromCodePoint(
    ...[...this.country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
};

/** What lists and search results need — never the image bytes. */
artistSchema.methods.toCard = function toCard() {
  return {
    _id: this._id,
    name: this.name,
    slug: this.slug,
    country: this.country || null,
    flag: this.flag(),
    hasImage: Boolean(this.imageBytes),
    songCount: this.songCount || 0
  };
};

export default mongoose.model('Artist', artistSchema);
