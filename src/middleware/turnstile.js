/**
 * Cloudflare Turnstile.
 *
 * The widget in the browser proves nothing on its own — anyone can post the
 * form without ever loading it. The token it produces has to be exchanged with
 * Cloudflare here, server side, or the whole thing is decoration.
 *
 * Config is read per request rather than at import, because ESM hoists imports
 * above dotenv.config() and a secret captured at module load is undefined.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Skipped entirely when no secret is set.
 *
 * That is deliberate: the site has to keep working before the keys exist, and
 * a half-configured CAPTCHA that rejects everyone is worse than none. The
 * trade-off is that a missing secret in production silently disables it — hence
 * the warning at startup.
 */
export async function verifyTurnstile(req, res, next) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return next();

  const token = req.body?.turnstileToken;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'Potvrdi da nisi robot.' });
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    // The address is sent so Cloudflare can weigh it; behind a proxy this is
    // the client's, because the app trusts one proxy hop.
    if (req.ip) body.set('remoteip', req.ip);

    const outcome = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000)
    }).then((r) => r.json());

    if (!outcome.success) {
      return res.status(400).json({ message: 'Provjera nije prošla. Pokušaj ponovo.' });
    }
    return next();
  } catch {
    /**
     * Cloudflare unreachable. Letting the request through is the deliberate
     * choice: the alternative is that an outage at a third party locks every
     * new reader out of registering, and the rate limiter is still in front of
     * these routes.
     */
    console.warn('[turnstile] verification unreachable, allowing request');
    return next();
  }
}
