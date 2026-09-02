const jwt = require('jsonwebtoken');
const { pool } = require('../db');

// A token issued before this check existed carries no `tv` claim at all —
// treated as version 0 so shipping this doesn't invalidate every existing
// session on deploy. Only a password change/reset from here on bumps the
// real column past 0.
async function checkTokenVersion(decoded) {
  const { rows } = await pool.query('SELECT token_version FROM users WHERE id = $1', [decoded.id]);
  if (!rows[0]) return false;
  return (decoded.tv || 0) === rows[0].token_version;
}

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!(await checkTokenVersion(decoded))) {
      return res.status(401).json({ error: 'Session expired — please log in again.' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

// For endpoints loaded via a plain <img src>/<a href> (attachments), which
// can't carry an Authorization header — accepts the token as a query
// param instead, falling back to the header for any other caller. Scoped to
// just those routes rather than folded into authMiddleware, since a token
// in the URL shows up in server logs and browser history and shouldn't be
// accepted more broadly than it needs to be.
async function authFromHeaderOrQuery(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!(await checkTokenVersion(decoded))) {
      return res.status(401).json({ error: 'Session expired — please log in again.' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware, adminMiddleware, authFromHeaderOrQuery, checkTokenVersion };
