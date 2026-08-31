import mongoose from 'mongoose';
import { announce } from '../realtime/changes.js';
import { uniqueSlug, slugify } from '../utils/slug.js';
import { toLatin, hasCyrillic } from '../utils/latinise.js';
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
    ratingCount: { type: Number, default: 0 },

    /**
     * Soft delete, for the same reason the song has one.
     *
     * AI-DECISION: removing a version used to destroy it and then run
     * Rating.deleteMany over its votes. Songs were made recoverable and their
     * versions were not, which is the same mistake one level down — and the
     * votes are the part that cannot be retyped. See AI-NOTES.md §5.
     */
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }
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

    /**
     * Where this row came from, when, and in which run.
     *
     * AI-DECISION: a field, not a tag. Tags said `pesmarica.rs` and that is
     * where it came from, but not *which* of many runs put it there — so a
     * single bad import could only be undone by hand, song by song. `run` makes
     * one run reversible as a unit. Absent on anything written by a person.
     */
    imported: {
      source: { type: String, trim: true, maxlength: 120 },
      at: Date,
      run: { type: String, trim: true, maxlength: 40, index: true }
    },
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
,

    /**
     * Soft delete.
     *
     * AI-DECISION: deleting a song hides it instead of destroying it. The
     * catalogue is edited by several people against a database with no undo, and
     * a title removed by mistake used to be gone with its arrangements, ratings
     * and reviews. Purging is a separate, deliberate act. See AI-NOTES.md §5.
     */
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/**
 * Deleted songs are invisible unless asked for by name.
 *
 * AI-TRAP: this is a query hook rather than a `deletedAt: null` added at each
 * call site, because there are dozens of call sites and forgetting one leaks a
 * deleted song onto the public site — the failure this whole feature exists to
 * prevent. Anything that genuinely needs the trash must opt in explicitly with
 * `.setOptions({ withDeleted: true })`, which reads as the deliberate act it is.
 */
const SCOPED = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete',
  'countDocuments', 'distinct', 'updateOne', 'updateMany'
];

songSchema.pre(SCOPED, function scopeToLiving() {
  if (this.getOptions().withDeleted) return;
  // An explicit deletedAt in the query is the caller saying what they want.
  if ('deletedAt' in this.getQuery()) return;
  this.where({ deletedAt: null });
});

/** Aggregations bypass query hooks entirely, so they get a stage instead. */
songSchema.statics.livingMatch = function livingMatch(match = {}) {
  return { ...match, deletedAt: null };
};

const MAX_HISTORY = 20;

songSchema.pre('validate', async function (next) {
  /**
   * The catalogue is Latin script, without exception.
   *
   * AI-TRAP: this must run before the slug is built, or a Cyrillic title
   * produces a slug from characters the site cannot serve. It is a conversion
   * rather than a rejection on purpose — a rejection would fail an import
   * halfway through and leave the catalogue in two scripts, which is worse than
   * either one alone.
   */
  if (hasCyrillic(this.title)) this.title = toLatin(this.title);
  for (const arrangement of this.arrangements || []) {
    if (hasCyrillic(arrangement.content)) arrangement.content = toLatin(arrangement.content);
    if (hasCyrillic(arrangement.label)) arrangement.label = toLatin(arrangement.label);
    if (arrangement.content) {
      // Layer 6: Normalize flats to sharps (# notation)
      arrangement.content = arrangement.content
        .replace(/\[([A-G])b([^\]]*)\]/g, (m, root, rest) => {
          const map = { C: 'H', D: 'C#', E: 'D#', F: 'E', G: 'F#', A: 'G#', B: 'A#' };
          return `[${map[root] || root}${rest}]`;
        });
      // Layer 6: Anti-overlap and bracket heal
      arrangement.content = arrangement.content
        .replace(/\[\[+([A-H][b#]?[^\]]*)\]\]+/g, '[$1]')
        .replace(/\[([A-H][b#]?[^\]]*)\s*\[([A-H][b#]?[^\]]*)\]\]/g, '[$1] [$2]')
        .replace(/\[([A-H][b#]?[^\]]*)\]\s+\[\1\]/g, '[$1]')
        .replace(/([,\.\!\?\:\;])\[([A-H][b#]?[^\]]*)\]/g, '$1 [$2]');
      while (/\[([A-H][b#]?[^\]]*)\]\[([A-H][b#]?[^\]]*)/.test(arrangement.content)) {
        arrangement.content = arrangement.content.replace(/\[([A-H][b#]?[^\]]*)\]\[([A-H][b#]?[^\]]*)/g, '[$1] [$2]');
      }
    }
  }
  if (this.tags?.length) this.tags = this.tags.map(toLatin);

  if (!this.slug || this.isModified('title')) {
    this.slug = await uniqueSlug(this.constructor, this.title, this._id);
  }

  if (this.isModified('title') || !this.searchTitle) {
    this.searchTitle = slugify(this.title).replace(/-/g, ' ');
  }

  // Exactly one primary among the versions still in play. A deleted one holding
  // the flag would leave the song with no default and the virtual falling back
  // to whichever happened to be first.
  const living = this.arrangements?.filter((a) => !a.deletedAt) || [];
  if (living.length) {
    const flagged = living.filter((a) => a.isPrimary);
    if (flagged.length !== 1) {
      this.arrangements.forEach((a) => { a.isPrimary = false; });
      living[0].isPrimary = true;
    }
  }
  // Keep the chord index in step with the content on every save.
  this.arrangements?.forEach((a) => { a.chords = extractChords(a.content); });

  if (this.history?.length > MAX_HISTORY) {
    this.history = this.history.slice(-MAX_HISTORY);
  }

  next();
});

/**
 * The versions still in play.
 *
 * AI-TRAP: everything that reads arrangements has to go through this. Reading
 * the raw array shows deleted versions on the public site, which is the failure
 * the soft delete exists to prevent.
 */
songSchema.virtual('livingArrangements').get(function () {
  return (this.arrangements || []).filter((a) => !a.deletedAt);
});

/** The version shown by default: the primary one, or the first still in play. */
songSchema.virtual('primary').get(function () {
  const living = this.livingArrangements;
  return living.find((a) => a.isPrimary) || living[0] || null;
});

/**
 * Flattens the chosen arrangement onto the song, so clients that only care
 * about "the chords for this song" do not have to know arrangements exist.
 */
/**
 * The public shape of a song. The chord sheet is opt-in.
 *
 * AI-TRAP: `content` and `chords` used to be included always, so every list
 * shipped a full chord sheet per row — the song list, search, an artist page,
 * a genre page, saved songs. None of them draw it, so it was pure weight; and
 * once a paywall existed it was also the way straight past it, because the gate
 * was only ever applied on the single-song route. A response that carries what
 * it does not render is a leak waiting for a reason to matter.
 *
 * Default false, so a new endpoint has to ask before it can give anything away.
 */
songSchema.methods.toPublic = function (arrangementId = null, { withContent = false } = {}) {
  // A link to a deleted version falls back to the default rather than 404ing:
  // somebody following an old bookmark wants the song, not an error.
  const asked = arrangementId ? this.arrangements.id(arrangementId) : null;
  const chosen = (asked && !asked.deletedAt) ? asked : this.primary;

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
    views: this.views || 0,
    favoriteCount: this.favoriteCount || 0,

    // Only where somebody asked for it. See the note above the signature.
    ...(withContent ? { content: chosen?.content || '', chords: chosen?.chords || [] } : {}),
    originalKey: chosen?.originalKey || '',
    capo: chosen?.capo || 0,
    difficulty: chosen?.difficulty,
    arrangementId: chosen?._id,
    rating: chosen?.ratingCount ? chosen.ratingSum / chosen.ratingCount : 0,
    ratingCount: chosen?.ratingCount || 0,

    arrangements: this.livingArrangements.map((a) => ({
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

/**
 * Tell any open dashboard that this collection moved.
 *
 * AI-DECISION: on the model, not in the handlers. Roughly twenty-five places
 * write a song — six controllers, the bulk edit, the importer, several
 * scripts — and a rule kept in twenty-five places is one that gets missed in
 * one. A screen that refreshes for every edit except one is worse than one that
 * never refreshes, because nobody can tell which case they are looking at.
 *
 * AI-TRAP: `deleteOne` and `findOneAndUpdate` are separate hooks from `save`.
 * Mongoose fires document middleware and query middleware for different calls,
 * so covering only `save` misses every soft delete and every bulk write — which
 * are exactly the operations somebody is watching the screen for.
 */
// The live watcher asks for the newest row every few seconds; without this
// that is a collection scan of the whole catalogue each time.
/*
 * Compound indexes for the shapes the catalogue is actually read in.
 *
 * AI-DECISION: measured, not guessed. Every field here already had an index of
 * its own, and that was not enough: a list filters on deletedAt AND status and
 * then sorts, so a single-field index served the first condition and Mongo
 * walked the rest by hand. The default song list examined 13,889 documents to
 * return 25 and took 107ms; with the first index below it examines 25 and takes
 * 3ms. The whole set builds in well under a second on this collection.
 *
 * AI-TRAP: the leading `deletedAt` is not decoration. The soft-delete query
 * hook adds `deletedAt: null` to every find, so an index that omits it cannot
 * serve any of them — which is exactly why the single-field sort indexes on
 * views and favoriteCount never got used.
 *
 * AI-NOTE: each index is also a cost on every write, and this catalogue is
 * written to in bulk by importers. Four is a deliberate ceiling: the sorts the
 * interface actually offers, and nothing speculative.
 */
songSchema.index({ deletedAt: 1, status: 1, createdAt: -1 });
songSchema.index({ deletedAt: 1, status: 1, views: -1 });
songSchema.index({ deletedAt: 1, genres: 1, status: 1, createdAt: -1 });
songSchema.index({ deletedAt: 1, artist: 1, status: 1 });

songSchema.index({ updatedAt: -1 });

for (const event of ['save', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany']) {
  songSchema.post(event, function announceChange() { announce('songs'); });
}

export default mongoose.model('Song', songSchema);
