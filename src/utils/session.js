import { signToken, REALM_USER, REALM_STAFF } from './jwt.js';

/**
 * Separate cookie names per realm, so a browser signed into both the public
 * site and the dashboard holds two independent sessions that cannot be
 * mistaken for one another.
 */
export const USER_COOKIE = 'octava_session';
export const STAFF_COOKIE = 'octava_staff';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The dashboard session is short and idle-based, unlike a reader's.
 *
 * A reader losing their session is an inconvenience; a dashboard session left
 * open on an unattended laptop is somebody else's access to the whole
 * catalogue. The client renews this while the person is actually working, so
 * the expiry is reached only by going idle — which is the case worth ending.
 *
 * AI-TRAP: read at call time, not at module load. Freezing an env value at
 * import is the mistake mailer.js documents; the tests set this per case.
 */
export const staffSessionMinutes = () =>
  Number(process.env.STAFF_SESSION_MINUTES) || 60;

function issue(res, cookieName, subject, realm, extra, ttl = null) {
  const token = signToken(subject, realm, extra, ttl?.jwt);

  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure would make the cookie invisible over plain http in local dev.
    secure: process.env.NODE_ENV === 'production',
    maxAge: ttl?.cookieMs ?? SEVEN_DAYS_MS,
    path: '/'
  });

  return token;
}

export const issueUserSession = (res, user) =>
  issue(res, USER_COOKIE, user._id, REALM_USER);

export const issueStaffSession = (res, staff) => {
  const minutes = staffSessionMinutes();
  // Cookie and token expire together: a cookie outliving its token leaves a
  // browser sending credentials that can only ever be refused.
  return issue(res, STAFF_COOKIE, staff._id, REALM_STAFF, { role: staff.role }, {
    jwt: `${minutes}m`,
    cookieMs: minutes * 60 * 1000
  });
};

export const clearUserSession = (res) => res.clearCookie(USER_COOKIE, { path: '/' });
export const clearStaffSession = (res) => res.clearCookie(STAFF_COOKIE, { path: '/' });
