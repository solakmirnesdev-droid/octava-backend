import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';

/**
 * Populates req.user from a Bearer token, or 401s.
 *
 * The user is re-read on every request rather than trusted from the token
 * payload, so a role change or deletion takes effect immediately instead of
 * waiting out the token's expiry.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Prijava je obavezna.' });
  }

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Nalog više ne postoji.' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Sesija je istekla. Prijavi se ponovo.' });
  }
}

/** Gate a route to specific roles. Admin passes everything. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Prijava je obavezna.' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ message: 'Nemaš dozvolu za ovu radnju.' });
  };
}

/** Attaches req.user when a token is present, but never rejects. */
export async function optionalAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      req.user = await User.findById(verifyToken(token).sub);
    } catch {
      // An unreadable token on a public route is simply an anonymous visit.
    }
  }
  next();
}
