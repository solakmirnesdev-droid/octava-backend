import User from '../models/User.js';
import { issueSession, clearSession } from '../utils/session.js';

const MIN_PASSWORD_LENGTH = 8;

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

    const user = await User.create({
      email: normalized,
      username: username.trim(),
      passwordHash: await User.hashPassword(password)
      // role intentionally omitted: self-registration always yields 'user'.
      // Worker and admin roles are granted deliberately, never requested.
    });

    res.status(201).json({ token: issueSession(res, user), user: user.toPublic() });
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

    // One message for both branches, so the response cannot be used to
    // enumerate which email addresses have accounts.
    const invalid = { message: 'Pogrešan email ili lozinka.' };
    if (!user) return res.status(401).json(invalid);
    if (!(await user.verifyPassword(password))) return res.status(401).json(invalid);

    user.lastLoginAt = new Date();
    await user.save();

    res.json({ token: issueSession(res, user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
}

/**
 * Login for the dashboard. Same credentials, but ordinary users are turned
 * away so an app account cannot reach the editing tools.
 */
export async function loginStaff(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email i lozinka su obavezni.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
    const invalid = { message: 'Pogrešan email ili lozinka.' };

    if (!user) return res.status(401).json(invalid);
    if (!(await user.verifyPassword(password))) return res.status(401).json(invalid);
    if (user.role === 'user') {
      return res.status(403).json({ message: 'Ovaj nalog nema pristup uredničkom panelu.' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    res.json({ token: issueSession(res, user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res) {
  res.json({ user: req.user.toPublic() });
}

export async function logout(_req, res) {
  clearSession(res);
  res.json({ ok: true });
}
