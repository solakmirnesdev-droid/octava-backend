import jwt from 'jsonwebtoken';

function secret() {
  const value = process.env.JWT_SECRET;
  // Failing loudly beats signing every token with an empty string.
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    secret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}
