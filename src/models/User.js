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
userSchema.methods.toPublic = function () {
  return {
    id: this._id,
    email: this.email,
    username: this.username,
    country: this.country || null,
    flag: this.flag(),
    hasAvatar: Boolean(this.avatarBytes),
    emailVerified: this.emailVerified,
    createdAt: this.createdAt
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
