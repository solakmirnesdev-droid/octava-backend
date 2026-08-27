import User from '../models/User.js';
import Staff from '../models/Staff.js';
import {
  issueUserSession, issueStaffSession,
  clearUserSession, clearStaffSession
} from '../utils/session.js';
import { signChallenge, verifyToken, REALM_STAFF_CHALLENGE } from '../utils/jwt.js';
import { verifyCode, consumeBackupCode } from '../utils/totp.js';
import Notification from '../models/Notification.js';

const MIN_PASSWORD_LENGTH = 8;

/** One message for both branches, so responses cannot enumerate accounts. */
const INVALID = { message: 'Pogrešan email ili lozinka.' };

// ---------------------------------------------------------------- readers ---

export async function register(req, res, next) {
  try {
    const { email, password, username, country } = req.body;

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
      // Optional at signup. Asking for it is worth a flag beside their reviews;
      // requiring it is a form people abandon.
      country: country ? String(country).toUpperCase().trim() : undefined,
      passwordHash: await User.hashPassword(password)
    });

    await Notification.raise({

      type: 'user.registered',

      actor: user._id,

      summary: `${user.username} (${user.email})`

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

    // With a second factor set, the password alone buys nothing but a
    // five-minute ticket to the next step. No session is issued here.
    if (staff.totpEnabled) {
      return res.json({
        twoFactorRequired: true,
        challenge: signChallenge(staff._id)
      });
    }

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

/**
 * Second step of the editorial login.
 *
 * Accepts either a current authenticator code or one of the single-use backup
 * codes. A used counter is recorded so an observed code cannot be replayed
 * inside its own thirty-second window.
 */
export async function staffLoginVerify(req, res, next) {
  try {
    const { challenge, code } = req.body;
    if (!challenge || !code) {
      return res.status(400).json({ message: 'Kod je obavezan.' });
    }

    let payload;
    try {
      payload = verifyToken(challenge, REALM_STAFF_CHALLENGE);
    } catch {
      return res.status(401).json({ message: 'Prijava je istekla. Pokušaj ponovo.' });
    }

    const staff = await Staff.findById(payload.sub)
      .select('+totpSecret +totpLastCounter +backupCodes');

    if (!staff || !staff.active || !staff.totpEnabled) {
      return res.status(401).json(INVALID);
    }

    const counter = verifyCode(staff.totpSecret, staff.email, code, staff.totpLastCounter);

    if (counter !== null) {
      staff.totpLastCounter = counter;
    } else {
      // Not a valid code; it may still be a recovery code.
      const remaining = await consumeBackupCode(code, staff.backupCodes);
      if (!remaining) {
        return res.status(400).json({ message: 'Pogrešan kod.' });
      }
      staff.backupCodes = remaining;
    }

    staff.lastLoginAt = new Date();
    await staff.save();

    res.json({
      token: issueStaffSession(res, staff),
      user: staff.toPublic(),
      backupCodesRemaining: staff.backupCodes.length
    });
  } catch (err) {
    next(err);
  }
}
