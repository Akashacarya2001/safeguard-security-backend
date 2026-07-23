/**
 * requireRole('admin') or requireRole('staff', 'admin') etc.
 * Must run AFTER `authenticate` so req.user is populated.
 *
 * This is what actually enforces "staff cannot reach admin features" —
 * server-side, on every request, regardless of what the frontend shows.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this resource' });
    }
    next();
  };
}

module.exports = { requireRole };
