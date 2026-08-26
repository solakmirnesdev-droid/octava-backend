import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { issueUserSession } from '../utils/session.js';

/**
 * Sign in with Google.
 *
 * The browser does the Google dance itself and hands us the resulting ID token;
 * we verify it against Google's keys rather than trusting anything the client
 * says about who it is. An unverified token is the whole attack — without this
 * check anyone could post a JSON blob claiming any email.
 *
 * Read at call time, not at module load: ESM hoists imports above
 * dotenv.config(), so a client id captured here at import would be undefined.
 */
function client() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return null;
  return { id, oauth: new OAuth2Client(id) };
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}

/** Tells the app whether to render the button at all. */
export function status(_req, res) {
  res.json({ enabled: googleConfigured(), clientId: process.env.GOOGLE_CLIENT_ID || null });
}

export async function login(req, res, next) {
  try {
    const c = client();
    if (!c) return res.status(503).json({ message: 'Google prijava nije podešena.' });

    const credential = req.body.credential;
    if (typeof credential !== 'string' || !credential) {
      return res.status(400).json({ message: 'Nedostaje Google token.' });
    }

    let payload;
    try {
      const ticket = await c.oauth.verifyIdToken({ idToken: credential, audience: c.id });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ message: 'Google token nije ispravan.' });
    }

    /**
     * Google says the address is verified, or we do not use it. An unverified
     * Google address is one somebody typed, and treating it as proof of
     * ownership would hand over any account whose email was guessed.
     */
    if (!payload?.email || payload.email_verified !== true) {
      return res.status(401).json({ message: 'Google nalog nema potvrđenu email adresu.' });
    }

    const email = payload.email.toLowerCase();

    // Existing Google account.
    let user = await User.findOne({ googleId: payload.sub });

    if (!user) {
      const byEmail = await User.findOne({ email });
      if (byEmail) {
        // Linking is safe only because Google proved this address. The password
        // account keeps its password; this adds a second way in, not a bypass.
        byEmail.googleId = payload.sub;
        byEmail.emailVerified = true;
        await byEmail.save();
        user = byEmail;
      } else {
        user = await User.create({
          email,
          username: (payload.name || email.split('@')[0]).slice(0, 40),
          googleId: payload.sub,
          emailVerified: true
        });
      }
    }

    user.lastLoginAt = new Date();
    await user.save();

    // Same cookie the password path sets, so the rest of the app cannot tell
    // which way someone signed in.
    res.json({ token: issueUserSession(res, user), user: user.toPublic() });
  } catch (err) { next(err); }
}
