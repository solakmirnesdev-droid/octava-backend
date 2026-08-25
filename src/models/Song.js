import mongoose from 'mongoose';
import { uniqueSlug, slugify } from '../utils/slug.js';
import { extractChords } from '../utils/chords.js';

/**
 * One playable version of a song.
 *
 * A song can carry several: an easy open-chord version, a full barre version,
 * a capo variant. Votes attach here rather than to the song, because rating a
 * song as a whole says nothing about whether a given arrangement is accurate.
 */
const arrangementSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 80, default: 'Osnovna verzija' },
    content: { type: String, required: true, maxlength: 20000 },
    originalKey: { type: String, required: true, trim: true, maxlength: 8 },
    capo: { type: Number, min: 0, max: 12, default: 0 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    chords: [String],
    isPrimary: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Denormalised from the Rating collection so lists can sort without a join.
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

arrangementSchema.virtual('rating').get(function () {
  return this.ratingCount ? this.ratingSum / this.ratingCount : 0;
});

const songSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, index: true },

    /**
     * De-accented lowercase title, searched instead of `title`.
     *
     * Readers type "noc" for "noć" and "zvijezda" the same either way; a plain
     * regex on the display title finds neither. Storing a folded copy keeps
     * matching diacritic-insensitive without a collation on every query.
     */
    searchTitle: { type: String, index: true },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true, index: true },

    arrangements: {
      type: [arrangementSchema],
      validate: [(v) => v.length > 0, 'Pjesma mora imati barem jednu verziju.']
    },

    genres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Genre', index: true }],
    tags: [{ type: String, trim: true, lowercase: true }],
    year: Number,
    youtubeId: String,

    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    views: { type: Number, default: 0, index: true },

    /**
     * Kept on the song rather than counted from User.favorites on demand.
     * Counting would mean scanning every user's array for every row of the
     * dashboard; a counter maintained at the two points where a favourite is
     * added or removed costs nothing to read.
     */
    favoriteCount: { type: Number, default: 0, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Short edit trail, so a worker can undo a bad change without a full
    // versioning system. Capped in the pre-save hook below.
    history: [
      {
        content: String,
        editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        editedAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

const MAX_HISTORY = 20;

songSchema.pre('validate', async function (next) {
  if (!this.slug || this.isModified('title')) {
    this.slug = await uniqueSlug(this.constructor, this.title, this._id);
  }

  if (this.isModified('title') || !this.searchTitle) {
    this.searchTitle = slugify(this.title).replace(/-/g, ' ');
  }

  // Exactly one primary. Fall back to the first if none was flagged.
  if (this.arrangements?.length) {
    const flagged = this.arrangements.filter((a) => a.isPrimary);
    if (flagged.length !== 1) {
      this.arrangements.forEach((a, i) => { a.isPrimary = i === 0; });
    }
    // Keep the chord index in step with the content on every save.
    this.arrangements.forEach((a) => { a.chords = extractChords(a.content); });
  }

  if (this.history?.length > MAX_HISTORY) {
    this.history = this.history.slice(-MAX_HISTORY);
  }

  next();
});

/** The version shown by default: the primary one, or the first. */
songSchema.virtual('primary').get(function () {
  return this.arrangements?.find((a) => a.isPrimary) || this.arrangements?.[0] || null;
});

/**
 * Flattens the chosen arrangement onto the song, so clients that only care
 * about "the chords for this song" do not have to know arrangements exist.
 */
songSchema.methods.toPublic = function (arrangementId = null) {
  const chosen = arrangementId
    ? this.arrangements.id(arrangementId) || this.primary
    : this.primary;

  return {
    _id: this._id,
    slug: this.slug,
    title: this.title,
    artist: this.artist,
    genres: this.genres,
    tags: this.tags,
    year: this.year,
    youtubeId: this.youtubeId,
    status: this.status,
    views: this.views,

    content: chosen?.content || '',
    originalKey: chosen?.originalKey || '',
    capo: chosen?.capo || 0,
    difficulty: chosen?.difficulty,
    chords: chosen?.chords || [],
    arrangementId: chosen?._id,
    rating: chosen?.ratingCount ? chosen.ratingSum / chosen.ratingCount : 0,
    ratingCount: chosen?.ratingCount || 0,

    arrangements: this.arrangements.map((a) => ({
      _id: a._id,
      label: a.label,
      originalKey: a.originalKey,
      capo: a.capo,
      difficulty: a.difficulty,
      isPrimary: a.isPrimary,
      rating: a.ratingCount ? a.ratingSum / a.ratingCount : 0,
      ratingCount: a.ratingCount
    }))
  };
};

// Weighted so a title match outranks a match buried in the lyrics.
songSchema.index(
  { title: 'text', 'arrangements.content': 'text' },
  { weights: { title: 10, 'arrangements.content': 1 }, name: 'song_search' }
);

export default mongoose.model('Song', songSchema);
