import { signToken } from './jwt.js';

export const SESSION_COOKIE = 'octava_session';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Issues the session as an httpOnly cookie and also returns the raw token.
 *
 * The cookie is what the server-rendered app uses: it travels automatically and
 * cannot be read by injected JavaScript, unlike a token kept in localStorage.
 * The token in the body is for the dashboard SPA, which is on a different
 * origin and sends it as a Bearer header instead.
 */
export function issueSession(res, user) {
  const token = signToken(user);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure would make the cookie invisible over plain http in local dev.
    secure: process.env.NODE_ENV === 'production',
    maxAge: SEVEN_DAYS_MS,
    path: '/'
  });

  return token;
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
