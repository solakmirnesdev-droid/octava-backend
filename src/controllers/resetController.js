import User from '../models/User.js';
import Staff from '../models/Staff.js';
import { createResetToken, hashResetToken, RESET_TTL_MINUTES } from '../utils/resetToken.js';
import { sendMail } from '../utils/mailer.js';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Identical whether or not the address has an account.
 *
 * Saying "no such account" would turn this endpoint into a way to discover who
 * is registered — the same reason the login error does not distinguish a wrong
 * password from an unknown email.
 */
const ACCEPTED = {
  message: 'Ako nalog postoji, poslali smo link za promjenu lozinke.'
};

const REALMS = {
  user: { model: User, path: 'nova-lozinka', label: 'Octava' },
  staff: { model: Staff, path: 'nova-lozinka', label: 'Octava — uredništvo' }
};

function resetUrl(realm, token) {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const path = REALMS[realm].path;
  return `${base}/${path}?token=${token}&realm=${realm}`;
}

async function issue(realm, email) {
  const { model, label } = REALMS[realm];
  const account = await model.findOne({ email: email.toLowerCase().trim() });

  // Nothing to do, but the caller is told the same either way.
  if (!account) return;
  if (realm === 'staff' && account.active === false) return;

  const { raw, hash, expiresAt } = createResetToken();
  account.resetTokenHash = hash;
  account.resetTokenExpiresAt = expiresAt;
  await account.save();

  const url = resetUrl(realm, raw);

  await sendMail({
    to: account.email,
    subject: `${label}: promjena lozinke`,
    text: [
      'Zatražena je promjena lozinke za tvoj nalog.',
      '',
      'Otvori ovaj link da postaviš novu:',
      url,
      '',
      `Link vrijedi ${RESET_TTL_MINUTES} minuta i može se upotrijebiti jednom.`,
      'Ako nisi ti tražio promjenu, slobodno zanemari ovu poruku — lozinka ostaje ista.'
    ].join('\n'),
    html: `<p>Zatražena je promjena lozinke za tvoj nalog.</p>
<p><a href="${url}">Postavi novu lozinku</a></p>
<p>Link vrijedi ${RESET_TTL_MINUTES} minuta i može se upotrijebiti jednom.</p>
<p>Ako nisi ti tražio promjenu, zanemari ovu poruku — lozinka ostaje ista.</p>`
  });
}

export async function forgot(req, res, next) {
  try {
    const { email, realm = 'user' } = req.body;
    if (!email || !REALMS[realm]) return res.json(ACCEPTED);

    // Failure to deliver must not reveal anything either, so the send is
    // reported but never surfaced to the caller.
    try {
      await issue(realm, email);
    } catch (err) {
      console.error('Slanje linka za promjenu lozinke nije uspjelo:', err.message);
    }

    res.json(ACCEPTED);
  } catch (err) {
    next(err);
  }
}

export async function reset(req, res, next) {
  try {
    const { token, password, realm = 'user' } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token i nova lozinka su obavezni.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Lozinka mora imati najmanje ${MIN_PASSWORD_LENGTH} znakova.` });
    }
    if (!REALMS[realm]) return res.status(400).json({ message: 'Neispravan zahtjev.' });

    const { model } = REALMS[realm];
    const account = await model
      .findOne({
        resetTokenHash: hashResetToken(token),
        resetTokenExpiresAt: { $gt: new Date() }
      })
      .select('+resetTokenHash +resetTokenExpiresAt +passwordChangedAt');

    if (!account) {
      return res.status(400).json({ message: 'Link je istekao ili je već iskorišten.' });
    }

    account.passwordHash = await model.hashPassword(password);

    // Consumed on use, so a link forwarded or left in a mailbox cannot be
    // replayed.
    account.resetTokenHash = undefined;
    account.resetTokenExpiresAt = undefined;

    // Anyone already holding a session loses it — which is the point when the
    // reset was prompted by someone else being in the account.
    account.passwordChangedAt = new Date();
    await account.save();

    res.json({ message: 'Lozinka je promijenjena. Prijavi se novom lozinkom.' });
  } catch (err) {
    next(err);
  }
}
