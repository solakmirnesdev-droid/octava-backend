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

    role: { type: String, enum: ['worker', 'admin'], default: 'worker', index: true },
    active: { type: Boolean, default: true },
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
    backupCodes: { type: [String], select: false, default: [] }
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
    totpEnabled: this.totpEnabled
  };
};

staffSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

export default mongoose.model('Staff', staffSchema);
