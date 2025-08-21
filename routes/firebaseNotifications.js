const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const FirebaseNotificationService = require('../services/firebaseNotificationService');
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

// FCM Token Management Routes (keeping these as they're still needed)

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

    // Find user and add token
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.addFcmToken(token, deviceType, deviceId);

    res.json({
      success: true,
      message: 'FCM token registered successfully',
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
 * @access Private (Regular Users and Admins)
 */
router.delete('/fcm/unregister', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'FCM token is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.removeFcmToken(token);

    res.json({
      success: true,
      message: 'FCM token unregistered successfully',
      tokenCount: user.fcmTokens.length
    });

  } catch (error) {
    console.error('FCM token unregistration error:', error);
    res.status(500).json({ error: 'Failed to unregister FCM token' });
  }
});

// Firebase-only Notification Routes

/**
 * @route GET /api/notifications
 * @desc Get notifications for current user from Firebase
 * @access Private (Regular Users and Admins)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      unreadOnly = false, 
      type = null,
      priority = null 
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true',
      type: type || null,
      priority: priority || null
    };

    const result = await FirebaseNotificationService.getNotificationsForUser(req.user.id, options);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      notifications: result.notifications,
      pagination: result.pagination,
      unreadCount: result.unreadCount
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * @route POST /api/notifications/send
 * @desc Send notification to user(s) using Firebase only (Admin only)
 * @access Private (Admin only)
 */
router.post('/send', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      recipients, // Array of user IDs or 'all' for broadcast
      title, 
      body, 
      type = 'system', 
      priority = 'normal',
      data = {},
      sendPush = true 
    } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    // Get sender information
    const sender = await User.findById(req.user.id);
    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const result = await FirebaseNotificationService.sendToUsers(
      recipients,
      title,
      body,
      {
        type,
        priority,
        sender,
        data,
        sendPush
      }
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      message: `Notifications sent to ${result.totalUsers} users`,
      totalUsers: result.totalUsers,
      successCount: result.successCount,
      failureCount: result.failureCount,
      results: result.results
    });

  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

/**
 * @route POST /api/notifications/send-to-user
 * @desc Send notification to specific user using Firebase only (Admin only)
 * @access Private (Admin only)
 */
router.post('/send-to-user', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      userId, 
      title, 
      body, 
      type = 'system', 
      priority = 'normal',
      data = {},
      sendPush = true 
    } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'User ID, title, and body are required' });
    }

    // Get sender information
    const sender = await User.findById(req.user.id);
    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const result = await FirebaseNotificationService.sendToUser(
      userId,
      title,
      body,
      {
        type,
        priority,
        sender,
        data,
        sendPush
      }
    );

    if (!result.success) {
      return res.status(result.error.includes('not found') ? 404 : 500).json({ error: result.error });
    }

    res.json({
      success: true,
      message: 'Notification sent successfully',
      notification: result.notification,
      pushResult: result.pushResult ? {
        success: result.pushResult.success,
        successCount: result.pushResult.successCount,
        failureCount: result.pushResult.failureCount
      } : null
    });

  } catch (error) {
    console.error('Send notification to user error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

/**
 * @route PUT /api/notifications/:id/read
 * @desc Mark notification as read in Firebase
 * @access Private (Regular Users and Admins)
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const result = await FirebaseNotificationService.markAsRead(req.user.id, req.params.id);

    if (!result.success) {
      const statusCode = result.error.includes('not found') ? 404 : 500;
      return res.status(statusCode).json({ error: result.error });
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * @route PUT /api/notifications/read-all
 * @desc Mark all notifications as read for current user in Firebase
 * @access Private (Regular Users and Admins)
 */
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const result = await FirebaseNotificationService.markAllAsRead(req.user.id);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete notification from Firebase
 * @access Private (Regular Users and Admins)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await FirebaseNotificationService.deleteNotification(req.user.id, req.params.id);

    if (!result.success) {
      const statusCode = result.error.includes('not found') ? 404 : 500;
      return res.status(statusCode).json({ error: result.error });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

/**
 * @route GET /api/notifications/stats
 * @desc Get notification statistics from Firebase (Admin only)
 * @access Private (Admin only)
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await FirebaseNotificationService.getNotificationStats();

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      stats: result.stats
    });

  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ error: 'Failed to fetch notification statistics' });
  }
});

/**
 * @route PUT /api/notifications/settings
 * @desc Update notification settings for current user (Simplified - all notifications enabled by default)
 * @access Private (Regular Users and Admins)
 */
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    // Since we removed notificationSettings, all notifications are enabled by default
    res.json({
      success: true,
      message: 'Notification settings simplified - all notifications are enabled by default',
      note: 'Notification settings functionality has been simplified. All notifications are now enabled by default.'
    });

  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

/**
 * @route POST /api/notifications/cleanup
 * @desc Cleanup old notifications from Firebase (Admin only)
 * @access Private (Admin only)
 */
router.post('/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;

    const result = await FirebaseNotificationService.cleanupOldNotifications(parseInt(daysOld));

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} old notifications`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Cleanup notifications error:', error);
    res.status(500).json({ error: 'Failed to cleanup notifications' });
  }
});

module.exports = router;
