import { signToken, REALM_USER, REALM_STAFF } from './jwt.js';

/**
 * Separate cookie names per realm, so a browser signed into both the public
 * site and the dashboard holds two independent sessions that cannot be
 * mistaken for one another.
 */
export const USER_COOKIE = 'octava_session';
export const STAFF_COOKIE = 'octava_staff';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function issue(res, cookieName, subject, realm, extra) {
  const token = signToken(subject, realm, extra);

  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure would make the cookie invisible over plain http in local dev.
    secure: process.env.NODE_ENV === 'production',
    maxAge: SEVEN_DAYS_MS,
    path: '/'
  });

  return token;
}

export const issueUserSession = (res, user) =>
  issue(res, USER_COOKIE, user._id, REALM_USER);

export const issueStaffSession = (res, staff) =>
  issue(res, STAFF_COOKIE, staff._id, REALM_STAFF, { role: staff.role });

export const clearUserSession = (res) => res.clearCookie(USER_COOKIE, { path: '/' });
export const clearStaffSession = (res) => res.clearCookie(STAFF_COOKIE, { path: '/' });
