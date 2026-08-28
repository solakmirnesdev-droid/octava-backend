import Staff from '../models/Staff.js';
import {
  generateSecret, buildQrCode, verifyCode,
  generateBackupCodes, consumeBackupCode
} from '../utils/totp.js';
import { makeOtp, checkOtp, otpMessage, MAX_ATTEMPTS } from '../utils/emailOtp.js';
import { sendMail, mailerMode } from '../utils/mailer.js';

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

// ------------------------------------------------------------ email codes ---

/**
 * Issues a fresh code and mails it, replacing any code still outstanding.
 *
 * Replacing rather than reusing matters: two live codes double the number of
 * values a guess can hit, and a person who asked for a new one has usually
 * decided the old one is lost.
 */
export async function issueEmailCode(staff) {
  const { plain, hash, expires } = await makeOtp();

  staff.emailOtpHash = hash;
  staff.emailOtpExpires = expires;
  staff.emailOtpAttempts = 0;
  await staff.save();

  await sendMail({ to: staff.email, ...otpMessage(plain) });
}

/**
 * Step one of turning email codes on: prove the mailbox actually receives.
 *
 * AI-TRAP: this refuses outright while the mailer is on its console transport.
 * Enabling a factor whose codes are printed to a server log rather than
 * delivered is not a misconfiguration that shows up later — it is an account
 * that can never be logged into again, and the person doing it has no way to
 * tell from the dashboard. Better a clear refusal than a locked door.
 */
export async function emailSetup(req, res, next) {
  try {
    const staff = await Staff.findById(req.staff._id).select('+passwordHash +emailOtpHash +emailOtpExpires +emailOtpAttempts');

    if (!(await staff.verifyPassword(req.body.password || ''))) {
      return res.status(401).json({ message: 'Pogrešna lozinka.' });
    }
    // The suite runs on the console transport by design — it asserts against the
    // printed code — so the guard would make the whole flow untestable.
    if (mailerMode() === 'console' && process.env.NODE_ENV !== 'test') {
      return res.status(409).json({
        message: 'Slanje pošte nije podešeno. Uključivanje bi zaključalo nalog jer kod ne bi nigdje stigao.'
      });
    }

    await issueEmailCode(staff);
    res.json({ sent: true, to: staff.email });
  } catch (err) { next(err); }
}

/** Step two: the code came back, so the address works. */
export async function emailEnable(req, res, next) {
  try {
    const staff = await Staff.findById(req.staff._id)
      .select('+emailOtpHash +emailOtpExpires +emailOtpAttempts +backupCodes');

    const verdict = await checkOtp(req.body.code, {
      hash: staff.emailOtpHash, expires: staff.emailOtpExpires, attempts: staff.emailOtpAttempts
    });

    if (verdict !== 'ok') {
      if (verdict === 'wrong') { staff.emailOtpAttempts += 1; await staff.save(); }
      return res.status(400).json({ message: otpError(verdict) });
    }

    staff.emailOtpEnabled = true;
    clearOtp(staff);

    // Recovery codes exist per account, not per factor; only mint a set if the
    // authenticator flow has not already handed one over.
    let plain = null;
    if (!staff.backupCodes.length) {
      const generated = await generateBackupCodes();
      staff.backupCodes = generated.hashed;
      plain = generated.plain;
    }

    await staff.save();
    res.json({ enabled: true, backupCodes: plain });
  } catch (err) { next(err); }
}

export async function emailDisable(req, res, next) {
  try {
    const staff = await Staff.findById(req.staff._id).select('+passwordHash +emailOtpHash +emailOtpExpires +emailOtpAttempts');

    if (!staff.emailOtpEnabled) {
      return res.status(409).json({ message: 'Potvrda mailom nije uključena.' });
    }
    if (!(await staff.verifyPassword(req.body.password || ''))) {
      return res.status(401).json({ message: 'Pogrešna lozinka.' });
    }

    staff.emailOtpEnabled = false;
    clearOtp(staff);
    await staff.save();

    res.json({ ok: true });
  } catch (err) { next(err); }
}

export function clearOtp(staff) {
  staff.emailOtpHash = undefined;
  staff.emailOtpExpires = undefined;
  staff.emailOtpAttempts = 0;
}

/** One sentence per failure, because they need different actions. */
export function otpError(verdict) {
  if (verdict === 'expired') return 'Kod je istekao. Zatraži novi.';
  if (verdict === 'locked') return `Previše pokušaja (${MAX_ATTEMPTS}). Zatraži novi kod.`;
  if (verdict === 'none') return 'Nema aktivnog koda. Zatraži novi.';
  return 'Pogrešan kod.';
}
