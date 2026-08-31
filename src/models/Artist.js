import mongoose from 'mongoose';
import { announce } from '../realtime/changes.js';
import { uniqueSlug, slugify } from '../utils/slug.js';
import { toLatin, hasCyrillic } from '../utils/latinise.js';

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

    /*
     * Who took the photograph, under what licence, and where it came from.
     *
     * AI-DECISION: not optional metadata — the licence is the reason the picture
     * may be shown at all. CC BY and CC BY-SA are free only *with attribution*,
     * so a portrait stored without these three fields is as much an infringement
     * as one lifted off a search engine. The page renders them; nothing writes an
     * image without them.
     */
    imageAuthor: { type: String, trim: true, maxlength: 200 },
    imageLicense: { type: String, trim: true, maxlength: 80 },
    imageSource: { type: String, trim: true, maxlength: 400 },

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
    /**
     * Where they are from, and when they were working.
     *
     * The three facts a reader actually wants beside a name on a songbook —
     * "Bijelo Dugme, Sarajevo, 1974–1989" says more than two paragraphs of
     * biography, and unlike a biography it can be filled in from a sleeve.
     */
    origin: { type: String, trim: true, maxlength: 80 },

    /** Soft delete, same shape as Song's. See the scoping hook below. */
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    activeFrom: { type: Number, min: 1800, max: 2100 },
    activeTo: { type: Number, min: 1800, max: 2100 },

    /** One official link. Not a directory — a single place to go and hear them. */
    website: { type: String, trim: true, maxlength: 200 },

    /**
     * MusicBrainz id, once an artist has been matched to one.
     *
     * AI-NOTE: kept so a later run can go straight to the record rather than
     * searching by name again — a name search returns whoever is most famous,
     * which is how "Regina" once came back as a Brazilian singer.
     */
    mbid: { type: String, trim: true, index: true, sparse: true },
    verifiedAt: { type: Date, default: null },

    genres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Genre', index: true }],
    songCount: { type: Number, default: 0 },

    /** Denormalised, so a list can sort by it without a join. */
    favoriteCount: { type: Number, default: 0, index: true }
  },
  { timestamps: true }
);

artistSchema.pre('validate', async function (next) {
  // MusicBrainz stores Macedonian and Russian artists in Cyrillic, which is how
  // "Тоше Проески" once arrived as a second copy of "Toše Proeski" — the
  // duplicate check compares names, and those two never match.
  if (hasCyrillic(this.name)) this.name = toLatin(this.name);

  if (!this.slug || this.isModified('name')) {
    this.slug = await uniqueSlug(this.constructor, this.name, this._id);
  }

  if (this.isModified('name') || !this.searchName) {
    this.searchName = slugify(this.name).replace(/-/g, ' ');
  }
  next();
});

/** Finds an artist by name, or creates one. Used when a worker types a name. */
/*
 * Deleted artists disappear from every ordinary query.
 *
 * AI-DECISION: the same list and the same shape as Song's, on purpose. Two soft
 * deletes that behave differently is worse than one — a caller should not have
 * to remember which model hides its dead rows and which does not.
 */
const SCOPED = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete',
  'countDocuments', 'distinct', 'updateOne', 'updateMany'
];

artistSchema.pre(SCOPED, function scopeToLiving() {
  if (this.getOptions().withDeleted) return;
  // An explicit deletedAt in the query is the caller saying what they want.
  if ('deletedAt' in this.getQuery()) return;
  this.where({ deletedAt: null });
});

/** Aggregations bypass query hooks entirely, so they get a stage instead. */
artistSchema.statics.livingMatch = function livingMatch(match = {}) {
  return { ...match, deletedAt: null };
};

artistSchema.statics.findOrCreateByName = async function (name) {
  if (!name) return null;
  let trimmed = toLatin(name).trim();

  // Strip parentheses and brackets e.g. "(peklenska) Pomaranca" -> "Pomaranca"
  trimmed = trimmed.replace(/^\s*[\(\[][^\)\]]*[\)\]]\s*/, '').trim();
  trimmed = trimmed.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').trim();
  trimmed = trimmed.replace(/[\.\-\_\,\:\;]+$/, '').trim();

  if (!trimmed) return null;

  // Title Case
  const words = trimmed.split(/(\s+|-)/);
  const lowercaseParticles = new Set(['i', 'u', 'na', 'o', 'po', 'sa', 'za', 'do', 'od', 'iz', 'k', 's', 'te', 'pa', 'ni', 'niti', '&']);
  const capitalized = words.map((w, i) => {
    if (/^\s+$/.test(w) || w === '-') return w;
    const lower = w.toLowerCase();
    if (i > 0 && lowercaseParticles.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('');

  const folded = slugify(capitalized).replace(/-/g, ' ');
  const targetSlug = slugify(capitalized);

  const existing = await this.findOne({
    $or: [
      { name: new RegExp(`^${capitalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      { searchName: folded },
      { slug: targetSlug }
    ]
  }).setOptions({ withDeleted: true });

  if (existing) {
    if (existing.deletedAt) {
      existing.deletedAt = null;
      existing.deletedBy = undefined;
      await existing.save();
    }
    return existing;
  }

  return this.create({ name: capitalized });
};


/**
 * The flag, built from the country code.
 *
 * Regional indicator symbols sit at a fixed offset from A-Z, so BA becomes the
 * two code points that a font renders as one flag. Nothing is stored: a country
 * has exactly one flag and duplicating it invites the two to disagree.
 */
/**
 * Codes with no state behind them, and therefore no flag.
 *
 * AI-TRAP: 🇾🇺 is a valid pair of regional indicators — the arithmetic below
 * happily produces it — but Unicode never assigned it and no font draws it, so
 * it lands on the page as two letters in dotted boxes. Six artists here are
 * coded YU because that is what MusicBrainz holds for a Yugoslav-era act, so
 * this is not a hypothetical. The site's own utils/countries.js carries the
 * same list; change one, change both.
 */
const NO_FLAG = new Set(['YU', 'CS', 'SU', 'DD']);

artistSchema.methods.flag = function flag() {
  if (!this.country || NO_FLAG.has(this.country.toUpperCase())) return null;
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
    imageUpdatedAt: this.imageUpdatedAt || null,
    imageAuthor: this.imageAuthor || null,
    imageLicense: this.imageLicense || null,
    imageSource: this.imageSource || null,
    songCount: this.songCount || 0,
    favoriteCount: this.favoriteCount || 0,
    origin: this.origin || null,
    activeFrom: this.activeFrom || null,
    activeTo: this.activeTo || null
  };
};

/**
 * Tell any open dashboard that this collection moved.
 *
 * AI-DECISION: on the model, not in the handlers. Roughly twenty-five places
 * write a an artist — six controllers, the bulk edit, the importer, several
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
 * The roster, alphabetically, which is how every screen reads it.
 *
 * Same reasoning as Song: the soft-delete hook puts `deletedAt` in front of
 * every query, so it has to lead the index or the sort falls back to walking
 * the collection - 2,813 documents examined to return 25.
 */
artistSchema.index({ deletedAt: 1, name: 1 });

artistSchema.index({ updatedAt: -1 });

for (const event of ['save', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany']) {
  artistSchema.post(event, function announceChange() { announce('artists'); });
}

export default mongoose.model('Artist', artistSchema);
