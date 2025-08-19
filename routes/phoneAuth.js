const express = require('express');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const User = require('../models/User');
const crypto = require('crypto');

const router = express.Router();

// Generate session token
const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate JWT token
const generateJWT = (userId, sessionToken) => {
  return jwt.sign(
    { userId, sessionToken },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Middleware to verify Firebase ID token
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'Firebase ID token is required' });
    }

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    return res.status(401).json({ error: 'Invalid Firebase token' });
  }
};

/**
 * @route POST /api/phone-auth/register
 * @desc Register new user with phone number via Firebase
 * @access Public
 */
router.post('/register', verifyFirebaseToken, async (req, res) => {
  try {
    const { deviceFingerprint, deviceInfo } = req.body;
    const { phone_number: phoneNumber, uid: firebaseUid } = req.firebaseUser;

    // Validate required fields
    if (!phoneNumber || !firebaseUid || !deviceFingerprint) {
      return res.status(400).json({ 
        error: 'Phone number, Firebase UID, and device fingerprint are required' 
      });
    }

    // Check if user already exists
    let user = await User.findByPhoneNumber(phoneNumber);
    
    if (user) {
      return res.status(400).json({ 
        error: 'User with this phone number already exists' 
      });
    }

    // Create new user
    const sessionToken = generateSessionToken();
    user = new User({
      phoneNumber,
      firebaseUid,
      isAdmin: false,
      securityProfile: {
        screenshotAttempts: 0,
        copyAttempts: 0,
        securityViolations: [],
        isBlocked: false
      }
    });

    // Create device session
    await user.createDeviceSession(deviceFingerprint, deviceInfo, sessionToken);

    // Generate JWT token
    const token = generateJWT(user._id, sessionToken);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt
      },
      token,
      sessionToken
    });

  } catch (error) {
    console.error('Phone registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

/**
 * @route POST /api/phone-auth/login
 * @desc Login user with phone number via Firebase
 * @access Public
 */
router.post('/login', verifyFirebaseToken, async (req, res) => {
  try {
    const { deviceFingerprint, deviceInfo } = req.body;
    const { phone_number: phoneNumber, uid: firebaseUid } = req.firebaseUser;

    // Validate required fields
    if (!phoneNumber || !firebaseUid || !deviceFingerprint) {
      return res.status(400).json({ 
        error: 'Phone number, Firebase UID, and device fingerprint are required' 
      });
    }

    // Find user by phone number
    const user = await User.findByPhoneNumber(phoneNumber);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is blocked
    if (user.isUserBlocked()) {
      return res.status(403).json({ 
        error: 'Account is blocked due to security violations',
        blockReason: user.securityProfile.blockReason
      });
    }

    // Verify Firebase UID matches
    if (user.firebaseUid !== firebaseUid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check for existing active session (single device enforcement)
    if (user.activeSession && user.activeSession.isActive) {
      if (user.activeSession.deviceFingerprint !== deviceFingerprint) {
        // Different device - revoke old session and create new one
        await user.revokeDeviceSession();
        
        // Record security violation for multiple login attempt
        await user.recordSecurityViolation('multiple_login_attempt', deviceInfo);
      }
    }

    // Create new device session
    const sessionToken = generateSessionToken();
    await user.createDeviceSession(deviceFingerprint, deviceInfo, sessionToken);

    // Update last seen and online status
    await user.setOnlineStatus(true);

    // Generate JWT token
    const token = generateJWT(user._id, sessionToken);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        isAdmin: user.isAdmin,
        lastSeen: user.lastSeen,
        securityProfile: {
          screenshotAttempts: user.securityProfile.screenshotAttempts,
          copyAttempts: user.securityProfile.copyAttempts,
          isBlocked: user.securityProfile.isBlocked
        }
      },
      token,
      sessionToken
    });

  } catch (error) {
    console.error('Phone login error:', error);
    res.status(500).json({ error: 'Failed to login user' });
  }
});

/**
 * @route POST /api/phone-auth/logout
 * @desc Logout user and revoke device session
 * @access Private
 */
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Revoke device session
    await user.revokeDeviceSession();
    
    // Set offline status
    await user.setOnlineStatus(false);

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

/**
 * @route GET /api/phone-auth/validate-session
 * @desc Validate current user session
 * @access Private
 */
router.get('/validate-session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { deviceFingerprint } = req.query;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    if (!deviceFingerprint) {
      return res.status(400).json({ error: 'Device fingerprint required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is blocked
    if (user.isUserBlocked()) {
      return res.status(403).json({ 
        error: 'Account is blocked',
        blockReason: user.securityProfile.blockReason
      });
    }

    // Validate device session
    const isValidSession = user.validateDeviceSession(deviceFingerprint, decoded.sessionToken);
    
    if (!isValidSession) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Update last seen
    await user.updateLastSeen();

    res.json({
      success: true,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        isAdmin: user.isAdmin,
        lastSeen: user.lastSeen,
        isOnline: user.isOnline
      },
      sessionValid: true
    });

  } catch (error) {
    console.error('Session validation error:', error);
    res.status(401).json({ error: 'Invalid session' });
  }
});

/**
 * @route POST /api/phone-auth/refresh-token
 * @desc Refresh JWT token while maintaining session
 * @access Private
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { deviceFingerprint } = req.body;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    if (!deviceFingerprint) {
      return res.status(400).json({ error: 'Device fingerprint required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate device session
    const isValidSession = user.validateDeviceSession(deviceFingerprint, decoded.sessionToken);
    
    if (!isValidSession) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Generate new JWT token with same session token
    const newToken = generateJWT(user._id, decoded.sessionToken);

    res.json({
      success: true,
      token: newToken,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        isAdmin: user.isAdmin
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});

module.exports = router;
