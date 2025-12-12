const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'file-upload-secret-2024';

// Generate JWT token for testing
router.post('/token', (req, res) => {
  try {
    const { userId, role } = req.body;

    // Validate input
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const validRoles = ['user', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'user';

    // Generate token
    const token = jwt.sign(
      {
        userId: userId,
        role: userRole,
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token: token,
      tokenType: 'Bearer',
      expiresIn: 86400,
      userId: userId,
      role: userRole
    });
  } catch (error) {
    console.error('Token generation error:', error.message);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Verify token
router.post('/verify', (req, res) => {
  try {
    const authHeader = req.get('authorization');
    
    if (!authHeader) {
      return res.status(400).json({ error: 'Authorization header required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(400).json({ error: 'Invalid authorization header format' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    res.json({
      valid: true,
      decoded: decoded,
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      error: 'Invalid or expired token',
      details: error.message
    });
  }
});

module.exports = router;
