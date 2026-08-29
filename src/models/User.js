import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Cost 12 is the current sensible default: slow enough to be expensive to
// attack offline, fast enough that a login still feels instant.
const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Neispravna email adresa.']
    },
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 40
    },
    passwordHash: {
      type: String,
      /**
       * Required only for accounts that sign in with a password. An account
       * created through Google has no password to hash, and demanding one would
       * mean inventing a secret the owner never chose and cannot use.
       */
      required: function requiredWithoutGoogle() { return !this.googleId; },
      // Never ships in a query result unless explicitly selected.
      select: false
    },

    /**
     * Google's stable subject id, not the email: an address can be reassigned
     * inside a workspace, the subject cannot.
     *
     * Left unset rather than null on accounts that do not use Google — see the
     * trap note below.
     */
    /**
     * AI-TRAP: no default. A sparse unique index skips documents where the field
     * is ABSENT, not where it is null — so `default: null` gives every
     * password account the same value and the second one ever created fails on
     * a duplicate key. The failure looks like a broken registration, nowhere
     * near this line.
     */
    googleId: { type: String, unique: true, sparse: true, select: false },

    /**
     * Whether the address is proven. Google tells us; a password signup does
     * not, which is why linking the two is gated on this.
     */
    emailVerified: { type: Boolean, default: false },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],

    /**
     * Saved artists, kept apart from saved songs.
     *
     * AI-DECISION: a second list rather than one polymorphic one. Following an
     * artist and bookmarking a song are different acts — one says "show me what
     * they do next", the other says "I want to play this" — and the saved page
     * shows them under separate headings. A mixed list would need a type field
     * on every entry to tell them apart again.
     */
    favoriteArtists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Artist' }],
    /**
     * Password reset. Only the hash of the token is kept, so a database leak
     * yields no usable links.
     */
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },

    /**
     * Sessions issued before this moment are refused.
     *
     * Tokens are stateless, so without this a reset would leave whoever
     * already held a session still signed in — which is precisely the person
     * a reset is meant to remove.
     */
    passwordChangedAt: { type: Date, select: false },

    /** See subscriptionActive() below — status and expiresAt are read together. */
    subscription: {
      status: {
        type: String,
        enum: ['none', 'active', 'cancelled', 'expired'],
        default: 'none'
      },
      plan: { type: String, enum: ['monthly', 'yearly'], default: undefined },
      startedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      cancelledAt: { type: Date, default: null },
      /** Which system granted it. 'simulated' never appears in production. */
      source: { type: String, default: undefined }
    },

    /**
     * Where the reader is.
     *
     * Two-letter ISO code, same shape the Artist carries, so one flag() serves
     * both. Optional on purpose: a signup that demands a country before letting
     * you save a song is a signup people abandon.
     */
    country: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{2}$/, 'Zemlja mora biti dvoslovna oznaka (npr. BA).'],
      default: undefined
    },

    /**
     * Portrait, stored in the document.
     *
     * AI-DECISION: same approach as the artist image — a small WebP kept beside
     * the record rather than a file service. It is a thumbnail next to a review,
     * so it never needs to be large, and one fewer moving part is worth more
     * here than the theoretical scale. See AI-NOTES.md §5.
     */
    avatar: { type: Buffer, select: false },
    avatarType: { type: String, enum: ['image/webp'], default: undefined },
    avatarBytes: { type: Number, default: 0 },
    avatarUpdatedAt: { type: Date, default: null },

    lastLoginAt: Date
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/**
 * The flag, built from the country code.
 *
 * Regional indicator symbols sit at a fixed offset from A-Z, so BA becomes the
 * two code points a font renders as one flag. Nothing is stored: a country has
 * exactly one flag, and keeping both invites the two to disagree.
 */
userSchema.methods.flag = function flag() {
  if (!this.country) return null;
  return String.fromCodePoint(...[...this.country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
};

/** Shape sent to clients. Never includes the hash. */
/**
 * Paid access.
 *
 * AI-DECISION: embedded on the account rather than kept in its own collection.
 * Every gated request has to answer "may this person read this?" in one lookup,
 * and the reader already arrives as a User document — a join on the hot path to
 * learn something with one row per account is work for no return. When a real
 * provider arrives, its webhooks write here and the receipts live wherever the
 * provider keeps them, which is where an auditor would look anyway.
 *
 * AI-TRAP: `expiresAt` is the authority, not `status`. A cancelled subscription
 * is still valid until the period it was paid for runs out, and an active one
 * whose date has passed is not. Read them together or people lose access they
 * paid for — or keep access they stopped paying for.
 */
userSchema.methods.subscriptionActive = function () {
  const sub = this.subscription;
  if (!sub || !sub.expiresAt) return false;
  if (sub.status !== 'active' && sub.status !== 'cancelled') return false;
  return sub.expiresAt.getTime() > Date.now();
};

userSchema.methods.toPublic = function () {
  return {
    id: this._id,
    email: this.email,
    username: this.username,
    country: this.country || null,
    flag: this.flag(),
    hasAvatar: Boolean(this.avatarBytes),
    emailVerified: this.emailVerified,
    createdAt: this.createdAt,
    subscription: {
      status: this.subscription?.status || 'none',
      plan: this.subscription?.plan || null,
      expiresAt: this.subscription?.expiresAt || null,
      active: this.subscriptionActive()
    }
  };
};

/**
 * What other readers see beside a review.
 *
 * AI-TRAP: never the email. It is on toPublic because that shape goes back to
 * the account's own owner; a review is read by everybody.
 */
userSchema.methods.toCard = function toCard() {
  return {
    id: this._id,
    username: this.username,
    flag: this.flag(),
    hasAvatar: Boolean(this.avatarBytes)
  };
};

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

export default mongoose.model('User', userSchema);
