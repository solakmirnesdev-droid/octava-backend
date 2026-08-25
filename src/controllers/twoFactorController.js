import Staff from '../models/Staff.js';
import {
  generateSecret, buildQrCode, verifyCode,
  generateBackupCodes, consumeBackupCode
} from '../utils/totp.js';

/**
 * Begins enrolment: mints a secret and shows it once as a QR code.
 *
 * The secret is stored but not activated. Until a code proves the phone can
 * actually generate one, enabling it would lock the account out of itself.
 */
export async function setup(req, res, next) {
  try {
    const staff = await Staff.findById(req.staff._id).select('+totpSecret');

    if (staff.totpEnabled) {
      return res.status(409).json({ message: 'Dvostruka potvrda je već uključena.' });
    }

    const secret = generateSecret();
    staff.totpSecret = secret;
    await staff.save();

    const { dataUrl } = await buildQrCode(secret, staff.email);

    res.json({
      qr: dataUrl,
      // Shown so a device without a camera can be set up by typing.
      secret
    });
  } catch (err) {
    next(err);
  }
}

export async function enable(req, res, next) {
  try {
    const staff = await Staff.findById(req.staff._id).select('+totpSecret +totpLastCounter');

    if (staff.totpEnabled) {
      return res.status(409).json({ message: 'Dvostruka potvrda je već uključena.' });
    }
    if (!staff.totpSecret) {
      return res.status(400).json({ message: 'Prvo pokreni postavljanje.' });
    }

    const counter = verifyCode(staff.totpSecret, staff.email, req.body.code);
    if (counter === null) {
      return res.status(400).json({ message: 'Pogrešan kod. Provjeri vrijeme na telefonu.' });
    }

    const { plain, hashed } = await generateBackupCodes();

    staff.totpEnabled = true;
    staff.totpLastCounter = counter;
    staff.backupCodes = hashed;
    await staff.save();

    // The only time the codes are readable. After this only hashes remain.
    res.json({ backupCodes: plain });
  } catch (err) {
    next(err);
  }
}

/**
 * Turning it off asks for the password as well as a code.
 *
 * A borrowed unlocked session should not be enough to strip the second factor
 * off an account.
 */
export async function disable(req, res, next) {
  try {
    const staff = await Staff.findById(req.staff._id).select('+passwordHash +totpSecret +totpLastCounter');

    if (!staff.totpEnabled) {
      return res.status(409).json({ message: 'Dvostruka potvrda nije uključena.' });
    }
    if (!(await staff.verifyPassword(req.body.password || ''))) {
      return res.status(401).json({ message: 'Pogrešna lozinka.' });
    }
    if (verifyCode(staff.totpSecret, staff.email, req.body.code, staff.totpLastCounter) === null) {
      return res.status(400).json({ message: 'Pogrešan kod.' });
    }

    staff.totpEnabled = false;
    staff.totpSecret = undefined;
    staff.totpLastCounter = undefined;
    staff.backupCodes = [];
    await staff.save();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** Issues a fresh set, invalidating whatever was there before. */
export async function regenerateBackupCodes(req, res, next) {
  try {
    const staff = await Staff.findById(req.staff._id).select('+passwordHash +backupCodes');

    if (!staff.totpEnabled) {
      return res.status(409).json({ message: 'Dvostruka potvrda nije uključena.' });
    }
    if (!(await staff.verifyPassword(req.body.password || ''))) {
      return res.status(401).json({ message: 'Pogrešna lozinka.' });
    }

    const { plain, hashed } = await generateBackupCodes();
    staff.backupCodes = hashed;
    await staff.save();

    res.json({ backupCodes: plain });
  } catch (err) {
    next(err);
  }
}

export { consumeBackupCode };
