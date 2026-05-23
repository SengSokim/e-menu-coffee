function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized. Please login.' });
}

module.exports = requireAuth;
