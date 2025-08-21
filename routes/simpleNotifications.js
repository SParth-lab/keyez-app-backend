const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SimpleNotificationService = require('../services/simpleNotificationService');
const { verifyFcmToken } = require('../config/firebase');

const router = express.Router();

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * @route POST /api/notifications/fcm/register
 * @desc Register FCM token for push notifications
 * @access Private (Regular Users and Admins)
 */
router.post('/fcm/register', authenticateToken, async (req, res) => {
  try {
    const { token, deviceType = 'android', deviceId } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'FCM token is required' });
    }

    // Verify token validity
    const tokenValidation = await verifyFcmToken(token);
    if (!tokenValidation.valid) {
      return res.status(400).json({ 
        error: 'Invalid FCM token', 
        details: tokenValidation.error 
      });
    }

    // Find user and add FCM token
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.addFcmToken(token, deviceType, deviceId);

    console.log(`✅ FCM token registered for user: ${user.username}`);

    res.status(200).json({
      message: 'FCM token registered successfully',
      user: user.getPublicProfile(),
      tokenCount: user.fcmTokens.length
    });

  } catch (error) {
    console.error('FCM token registration error:', error);
    res.status(500).json({ error: 'Failed to register FCM token' });
  }
});

/**
 * @route DELETE /api/notifications/fcm/unregister
 * @desc Unregister FCM token
 * @access Private
 */
router.delete('/fcm/unregister', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'FCM token is required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.removeFcmToken(token);

    console.log(`✅ FCM token unregistered for user: ${user.username}`);

    res.status(200).json({
      message: 'FCM token unregistered successfully',
      tokenCount: user.fcmTokens.length
    });

  } catch (error) {
    console.error('FCM token unregistration error:', error);
    res.status(500).json({ error: 'Failed to unregister FCM token' });
  }
});

/**
 * @route POST /api/notifications/broadcast
 * @desc Send broadcast notification to all users (Admin only)
 * @access Private (Admin only)
 */
router.post('/broadcast', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, body, data = {} } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    if (title.length > 100) {
      return res.status(400).json({ error: 'Title cannot be more than 100 characters' });
    }

    if (body.length > 500) {
      return res.status(400).json({ error: 'Body cannot be more than 500 characters' });
    }

    const result = await SimpleNotificationService.sendBroadcastNotification(title, body, data);

    res.status(200).json({
      message: result.message,
      success: result.success,
      totalUsers: result.totalUsers || 0,
      successCount: result.successCount || 0,
      error: result.error || null
    });

  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({ error: 'Failed to send broadcast notification' });
  }
});

/**
 * @route GET /api/notifications/status
 * @desc Get notification system status
 * @access Private (Admin only)
 */
router.get('/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get users with FCM tokens
    const usersWithTokens = await User.findUsersWithTokens();
    const totalTokens = usersWithTokens.reduce((sum, user) => sum + user.fcmTokens.length, 0);

    res.status(200).json({
      message: 'Notification system status',
      system: 'Simple FCM Notifications',
      users: {
        total: await User.countDocuments(),
        withTokens: usersWithTokens.length,
        totalTokens: totalTokens
      },
      features: [
        'FCM token management',
        'Message notifications',
        'Group message notifications', 
        'Broadcast notifications'
      ]
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get notification status' });
  }
});

module.exports = router;
