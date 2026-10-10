const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authorization = req.get('authorization');
  const token = authorization && authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({message: 'A bearer token is required'});
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({message: 'Authentication is not configured on the server'});
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload || typeof payload !== 'object' || !Number.isInteger(payload.user_id)) {
      return res.status(401).json({message: 'Invalid authentication token'});
    }

    req.user = {
      user_id: payload.user_id,
      role: payload.role,
    };
    return next();
  } catch (error) {
    return res.status(401).json({message: 'Invalid or expired authentication token'});
  }
};

module.exports = authenticateToken;