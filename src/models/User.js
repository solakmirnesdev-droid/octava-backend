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
    role: {
      type: String,
      enum: ['user', 'worker', 'admin'],
      default: 'user',
      index: true
    },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
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
    username: this.username,
    role: this.role
  };
};

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

export default mongoose.model('User', userSchema);
