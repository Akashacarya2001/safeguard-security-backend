const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Verifies the Bearer token and attaches { id, role, email } to req.user.
 * This is the ONLY place that should trust a user's role — the frontend
 * hiding admin nav items is a UX nicety, not a security boundary. Every
 * admin-only route must also pass through requireRole('admin') below.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = payload; // { id, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticate };
