import mongoose from 'mongoose';
import User from '../models/User.js';
import { issueUserSession } from '../utils/session.js';
import { isWebp, MAX_PORTRAIT_BYTES } from '../utils/webp.js';

/**
 * A reader's own account: their name, where they are, their portrait, and the
 * two credentials they can change.
 *
 * Until now an account was an email and a username set once at signup, with no
 * way to correct either — a typo in your own name was permanent.
 */

/** Reads the account fresh, since req.user omits the fields marked select:false. */
const withSecrets = (id) => User.findById(id).select('+passwordHash +passwordChangedAt');

export async function getProfile(req, res, next) {
  try {
    res.json({ user: req.user.toPublic() });
  } catch (err) { next(err); }
}

/** Display name and country. Neither is a credential, so neither needs a password. */
export async function updateProfile(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Nalog nije pronađen.' });

    if (typeof req.body.username === 'string') {
      const name = req.body.username.trim();
      if (name.length < 2 || name.length > 40) {
        return res.status(400).json({ message: 'Ime mora imati između 2 i 40 znakova.' });
      }
      user.username = name;
    }

    // An empty string clears it; absent leaves it alone. A form that always
    // sends the field would otherwise wipe the country on every unrelated save.
    if (req.body.country !== undefined) {
      user.country = req.body.country ? String(req.body.country).toUpperCase() : undefined;
    }

    await user.save();
    res.json({ user: user.toPublic() });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: Object.values(err.errors)[0]?.message || 'Neispravni podaci.' });
    }
    next(err);
  }
}

/**
 * Changing the address.
 *
 * AI-DECISION: gated on the current password even though the reader is already
 * signed in. An unattended browser is the ordinary case, and an address swapped
 * without a password is an account taken over quietly — the new owner simply
 * asks for a reset. See AI-NOTES.md §5.
 */
export async function changeEmail(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const next_ = String(email || '').trim().toLowerCase();

    if (!next_ || !password) {
      return res.status(400).json({ message: 'Nova adresa i lozinka su obavezni.' });
    }

    const user = await withSecrets(req.user._id);
    if (!user) return res.status(404).json({ message: 'Nalog nije pronađen.' });

    // An account created through Google has no password to check against.
    if (!user.passwordHash) {
      return res.status(409).json({
        message: 'Nalog je povezan s Googleom. Postavi lozinku prije promjene adrese.'
      });
    }
    if (!(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'Lozinka nije tačna.' });
    }
    if (next_ === user.email) {
      return res.status(409).json({ message: 'To je već tvoja adresa.' });
    }
    if (await User.findOne({ email: next_ })) {
      return res.status(409).json({ message: 'Ta adresa je već u upotrebi.' });
    }

    user.email = next_;
    // The new address is unproven until it is confirmed, whatever the old one was.
    user.emailVerified = false;
    await user.save();

    res.json({ user: user.toPublic() });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: Object.values(err.errors)[0]?.message || 'Neispravna adresa.' });
    }
    next(err);
  }
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ message: 'Nova lozinka mora imati barem 8 znakova.' });
    }

    const user = await withSecrets(req.user._id);
    if (!user) return res.status(404).json({ message: 'Nalog nije pronađen.' });

    // Someone who signed up through Google is setting a first password, not
    // replacing one, so there is nothing to check against.
    if (user.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Unesi trenutnu lozinku.' });
      }
      if (!(await user.verifyPassword(currentPassword))) {
        return res.status(401).json({ message: 'Trenutna lozinka nije tačna.' });
      }
      if (currentPassword === newPassword) {
        return res.status(400).json({ message: 'Nova lozinka mora biti različita od trenutne.' });
      }
    }

    user.passwordHash = await User.hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    await user.save();

    // AI-TRAP: passwordChangedAt invalidates every session issued before now,
    // including the one making this request. Handing back a fresh token is what
    // keeps a password change from signing you out of the page you did it on —
    // while still ejecting whoever else was holding a session.
    res.json({ token: issueUserSession(res, user), user: user.toPublic() });
  } catch (err) { next(err); }
}

export async function uploadAvatar(req, res, next) {
  try {
    const buf = req.body;
    if (!isWebp(buf)) {
      return res.status(415).json({ message: 'Slika mora biti u WebP formatu.' });
    }
    if (buf.length > MAX_PORTRAIT_BYTES) {
      return res.status(413).json({ message: `Slika smije biti najviše ${MAX_PORTRAIT_BYTES / 1024} KB.` });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Nalog nije pronađen.' });

    user.avatar = buf;
    user.avatarType = 'image/webp';
    user.avatarBytes = buf.length;
    user.avatarUpdatedAt = new Date();
    await user.save();

    res.json({ ok: true, bytes: buf.length });
  } catch (err) { next(err); }
}

export async function deleteAvatar(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Nalog nije pronađen.' });

    user.avatar = undefined;
    user.avatarType = undefined;
    user.avatarBytes = 0;
    user.avatarUpdatedAt = null;
    await user.save();

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * Serves one portrait.
 *
 * Public, because it hangs beside every review the person has written. Nothing
 * else about the account is reachable through this route.
 */
export async function serveAvatar(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();

    const user = await User.findById(req.params.id).select('+avatar avatarType avatarBytes avatarUpdatedAt');
    if (!user?.avatarBytes) return res.status(404).end();

    // Immutable for a day, keyed by the update time in the URL the client builds.
    res.set('Content-Type', user.avatarType || 'image/webp');
    res.set('Cache-Control', 'public, max-age=86400');
    if (user.avatarUpdatedAt) res.set('Last-Modified', user.avatarUpdatedAt.toUTCString());
    res.send(user.avatar);
  } catch (err) { next(err); }
}
