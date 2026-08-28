import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Editorial accounts, kept in a collection of their own.
 *
 * Deliberately not a role flag on User. Signing up on the public site must not
 * be able to produce anything that the dashboard will accept, and a bug in the
 * public registration path must not be able to escalate into editing access.
 * Two collections make that structural rather than a matter of checking a field
 * carefully in every handler.
 */
const staffSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Neispravna email adresa.']
    },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    passwordHash: { type: String, required: true, select: false },

    /**
     * Ranked, not a set of flags. Each level does everything the one below it
     * does, so a route asks for a minimum rather than listing every role that
     * should pass — which is how a new level ends up silently excluded.
     *
     *   worker      enters and edits songs
     *   admin       the above, plus deleting songs and handling requests
     *   superadmin  the above, plus the accounts of everyone else
     */
    role: {
      type: String,
      enum: ['worker', 'admin', 'superadmin'],
      default: 'worker',
      index: true
    },
    active: { type: Boolean, default: true },
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

    lastLoginAt: Date,

    /**
     * Second factor. The secret is as sensitive as the password hash — anyone
     * holding it can generate valid codes forever — so it never leaves the
     * database unless explicitly selected.
     */
    totpSecret: { type: String, select: false },
    totpEnabled: { type: Boolean, default: false },
    /** Highest counter already accepted, so a code cannot be replayed. */
    totpLastCounter: { type: Number, select: false },
    /** Hashed single-use recovery codes. */
    backupCodes: { type: [String], select: false, default: [] },

    /**
     * Email as a second factor. Independent of totpEnabled: an account may have
     * either, both, or neither, and a login offers whichever are switched on.
     *
     * The code is hashed for the same reason the password is — a database copy
     * should not hand somebody a working login — and the attempt counter is what
     * stops six digits from being guessed inside the challenge window.
     */
    emailOtpEnabled: { type: Boolean, default: false },
    emailOtpHash: { type: String, select: false },
    emailOtpExpires: { type: Date, select: false },
    emailOtpAttempts: { type: Number, select: false, default: 0 }
  },
  // Pinned, because the default pluraliser would name this 'staffs'.
  { timestamps: true, collection: 'staff' }
);

staffSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

staffSchema.methods.toPublic = function () {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    role: this.role,
    totpEnabled: this.totpEnabled,
    emailOtpEnabled: this.emailOtpEnabled
  };
};

staffSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

export default mongoose.model('Staff', staffSchema);
