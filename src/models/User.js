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
      required: true,
      // Never ships in a query result unless explicitly selected.
      select: false
    },
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

    lastLoginAt: Date
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** Shape sent to clients. Never includes the hash. */
userSchema.methods.toPublic = function () {
  return {
    id: this._id,
    email: this.email,
    username: this.username
  };
};

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

export default mongoose.model('User', userSchema);
