import { verifyToken, REALM_USER, REALM_STAFF } from '../utils/jwt.js';
import { USER_COOKIE, STAFF_COOKIE } from '../utils/session.js';
import User from '../models/User.js';
import Staff from '../models/Staff.js';

/**
 * Refuses a token minted before the password last changed.
 *
 * Sessions are stateless, so a reset would otherwise leave whoever already held
 * one still signed in — exactly the person a reset is meant to remove. The iat
 * claim is in seconds, so the comparison is floored to match.
 */
function issuedBeforePasswordChange(payload, account) {
  if (!account.passwordChangedAt || !payload.iat) return false;
  return payload.iat < Math.floor(account.passwordChangedAt.getTime() / 1000);
}

/**
 * Two clients, two transports: the server-rendered app sends an httpOnly
 * cookie, the dashboard SPA sends a Bearer header. Either is accepted, but the
 * cookie read is realm-specific so the two sessions never cross.
 */
function readToken(req, cookieName) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Bearer' && token) return token;
  return req.cookies?.[cookieName] || null;
}

/**
 * Both guards re-read the account on every request rather than trusting the
 * token payload, so a deactivation or a role change takes effect immediately
 * instead of waiting out the token's expiry.
 */
export async function requireUser(req, res, next) {
  const token = readToken(req, USER_COOKIE);
  if (!token) return res.status(401).json({ message: 'Prijava je obavezna.' });

  try {
    const payload = verifyToken(token, REALM_USER);
    const user = await User.findById(payload.sub).select('+passwordChangedAt');
    if (!user) return res.status(401).json({ message: 'Nalog više ne postoji.' });
    if (issuedBeforePasswordChange(payload, user)) {
      return res.status(401).json({ message: 'Lozinka je promijenjena. Prijavi se ponovo.' });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Sesija je istekla. Prijavi se ponovo.' });
  }
}

export async function requireStaff(req, res, next) {
  const token = readToken(req, STAFF_COOKIE);
  if (!token) return res.status(401).json({ message: 'Prijava je obavezna.' });

  try {
    const payload = verifyToken(token, REALM_STAFF);
    const staff = await Staff.findById(payload.sub).select('+passwordChangedAt');

    if (!staff) return res.status(401).json({ message: 'Nalog više ne postoji.' });
    if (!staff.active) return res.status(403).json({ message: 'Nalog je deaktiviran.' });
    if (issuedBeforePasswordChange(payload, staff)) {
      return res.status(401).json({ message: 'Lozinka je promijenjena. Prijavi se ponovo.' });
    }

    req.staff = staff;
    next();
  } catch {
    res.status(401).json({ message: 'Sesija je istekla. Prijavi se ponovo.' });
  }
}

/**
 * Ranks, high number wins. Comparing positions means a route states the lowest
 * level it will accept, instead of enumerating roles — an enumeration silently
 * locks out any level added later, including the one above the ones listed.
 */
export const ROLE_RANK = { worker: 1, admin: 2, superadmin: 3 };

/** Gates a staff route to a minimum rank. */
export function requireRole(minimum) {
  const required = ROLE_RANK[minimum];

  return (req, res, next) => {
    if (!req.staff) return res.status(401).json({ message: 'Prijava je obavezna.' });

    const held = ROLE_RANK[req.staff.role] || 0;
    if (held >= required) return next();

    return res.status(403).json({ message: 'Nemaš dozvolu za ovu radnju.' });
  };
}

/**
 * Attaches whichever session is present without ever rejecting.
 * Used on public routes that show more to editors, such as unpublished drafts.
 */
export async function optionalAuth(req, _res, next) {
  const userToken = readToken(req, USER_COOKIE);
  if (userToken) {
    try {
      req.user = await User.findById(verifyToken(userToken, REALM_USER).sub);
    } catch {
      // An unreadable token on a public route is simply an anonymous visit.
    }
  }

  const staffToken = req.cookies?.[STAFF_COOKIE] || readToken(req, STAFF_COOKIE);
  if (staffToken) {
    try {
      const staff = await Staff.findById(verifyToken(staffToken, REALM_STAFF).sub);
      if (staff?.active) req.staff = staff;
    } catch {
      // Same: no staff session simply means no drafts.
    }
  }

  next();
}
