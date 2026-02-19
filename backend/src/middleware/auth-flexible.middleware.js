const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Flexible auth middleware that checks:
 * 1. Query parameter 'token' (for SSE streams)
 * 2. Authorization header (for normal requests)
 */
const authFlexible = async (req, res, next) => {
  try {
    let token = null;

    // Check query parameter first (for SSE)
    if (req.query.token) {
      token = req.query.token;
      console.log('🔑 Token from query parameter');
    } 
    // Fallback to Authorization header
    else if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('🔑 Token from Authorization header');
    }

    if (!token) {
      console.error('❌ No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET, {
      audience: 'prism-app',
      issuer: 'prism-api'
    });

    console.log('✅ Token verified for user:', decoded.userId);

    // Attach user to request
    req.user = { 
      userId: decoded.userId,
      type: decoded.type 
    };

    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authFlexible;