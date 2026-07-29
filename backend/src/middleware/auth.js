const jwt = require('jsonwebtoken');

// requiredRole may be a single role string, an array of role strings, or
// omitted entirely (any authenticated user). 'admin' as a required role also
// accepts 'owner', since owners have full admin capabilities.
function auth(requiredRole) {
  const allowed = requiredRole == null ? null : (Array.isArray(requiredRole) ? requiredRole : [requiredRole]);
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      req.user = payload;
      if (allowed) {
        const effectiveRoles = payload.role === 'owner' && allowed.includes('admin') ? [...allowed, 'owner'] : allowed;
        if (!effectiveRoles.includes(payload.role)) return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

module.exports = auth;
