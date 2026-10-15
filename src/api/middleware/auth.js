






const jwt = require('jsonwebtoken');
const { config } = require('../../config');

function verifyToken(token) {
  return jwt.verify(token, config.auth.secret, { algorithms: [config.auth.algorithm] });
}

function requireAuth(req, res, next) {
  if (!config.auth.enabled) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return next();

  try {
    req.operator = verifyToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth, verifyToken };
