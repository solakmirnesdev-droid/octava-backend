import User from '../models/User.js';
import Staff from '../models/Staff.js';
import {
  issueUserSession, issueStaffSession,
  clearUserSession, clearStaffSession
} from '../utils/session.js';

const MIN_PASSWORD_LENGTH = 8;

/** One message for both branches, so responses cannot enumerate accounts. */
const INVALID = { message: 'Pogrešan email ili lozinka.' };

// ---------------------------------------------------------------- readers ---

export async function register(req, res, next) {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ message: 'Email, lozinka i korisničko ime su obavezni.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Lozinka mora imati najmanje ${MIN_PASSWORD_LENGTH} znakova.` });
    }

    const normalized = email.toLowerCase().trim();
    if (await User.exists({ email: normalized })) {
      return res.status(409).json({ message: 'Nalog s ovom email adresom već postoji.' });
    }

    // Public registration can only ever produce a reader. Editorial accounts
    // live in a different collection and are created deliberately.
    const user = await User.create({
      email: normalized,
      username: username.trim(),
      passwordHash: await User.hashPassword(password)
    });

    res.status(201).json({ token: issueUserSession(res, user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email i lozinka su obavezni.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
    if (!user || !(await user.verifyPassword(password))) return res.status(401).json(INVALID);

    user.lastLoginAt = new Date();
    await user.save();

    res.json({ token: issueUserSession(res, user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
}

export async function logout(_req, res) {
  clearUserSession(res);
  res.json({ ok: true });
}

export async function me(req, res) {
  res.json({ user: req.user.toPublic() });
}

// ---------------------------------------------------------------- editors ---

export async function staffLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email i lozinka su obavezni.' });
    }

    // Looks only at Staff. An account created on the public site does not
    // exist here at all, so there is nothing to reject in the first place.
    const staff = await Staff.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
    if (!staff || !(await staff.verifyPassword(password))) return res.status(401).json(INVALID);
    if (!staff.active) return res.status(403).json({ message: 'Nalog je deaktiviran.' });

    staff.lastLoginAt = new Date();
    await staff.save();

    res.json({ token: issueStaffSession(res, staff), user: staff.toPublic() });
  } catch (err) {
    next(err);
  }
}

export async function staffLogout(_req, res) {
  clearStaffSession(res);
  res.json({ ok: true });
}

export async function staffMe(req, res) {
  res.json({ user: req.staff.toPublic() });
}
