const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendPushNotification, sendNotificationToToken, verifyFcmToken, getDatabase } = require('../config/firebase');

const router = express.Router();

// Helper function to update notification in Firebase
const updateNotificationInFirebase = async (userId, notificationId, updates) => {
  try {
    if (!process.env.FIREBASE_PROJECT_ID) {
      return false;
    }

    const database = getDatabase();
    if (!database) {
      return false;
    }

    // Find the notification in Firebase by searching for the matching ID
    const notificationsRef = database.ref(`notifications/${userId}`);
    const snapshot = await notificationsRef.once('value');
    const notifications = snapshot.val();

    if (notifications) {
      for (const [firebaseKey, notification] of Object.entries(notifications)) {
        if (notification.id === notificationId) {
          await notificationsRef.child(firebaseKey).update(updates);
          console.log(`✅ Notification updated in Firebase for user: ${userId}`);
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.error('❌ Failed to update notification in Firebase:', error);
    return false;
  }
};

// Helper function to remove notification from Firebase
const removeNotificationFromFirebase = async (userId, notificationId) => {
  try {
    if (!process.env.FIREBASE_PROJECT_ID) {
      return false;
    }

    const database = getDatabase();
    if (!database) {
      return false;
    }

    // Find the notification in Firebase by searching for the matching ID
    const notificationsRef = database.ref(`notifications/${userId}`);
    const snapshot = await notificationsRef.once('value');
    const notifications = snapshot.val();

    if (notifications) {
      for (const [firebaseKey, notification] of Object.entries(notifications)) {
        if (notification.id === notificationId) {
          await notificationsRef.child(firebaseKey).remove();
          console.log(`✅ Notification removed from Firebase for user: ${userId}`);
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.error('❌ Failed to remove notification from Firebase:', error);
    return false;
  }
};

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

// FCM Token Management Routes

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

// Notification CRUD Routes

/**
 * @route GET /api/notifications
 * @desc Get notifications for current user
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

    const skip = (page - 1) * limit;
    const options = {
      limit: parseInt(limit),
      skip: parseInt(skip),
      unreadOnly: unreadOnly === 'true',
      type: type || null,
      priority: priority || null
    };

    const notifications = await Notification.findForUser(req.user.id, options);
    const unreadCount = await Notification.getUnreadCount(req.user.id);

    const formattedNotifications = notifications.map(notification => 
      notification.getPublicData()
    );

    res.json({
      success: true,
      notifications: formattedNotifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: notifications.length,
        hasMore: notifications.length === parseInt(limit)
      },
      unreadCount
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * @route POST /api/notifications/send
 * @desc Send notification to user(s) (Admin only)
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

    let targetUsers = [];
    
    if (recipients === 'all') {
      // Broadcast to all users
      targetUsers = await User.find({ isAdmin: false }); // Only send to regular users
    } else if (Array.isArray(recipients)) {
      // Send to specific users
      targetUsers = await User.find({ 
        _id: { $in: recipients },
        isAdmin: false // Only send to regular users
      });
    } else {
      return res.status(400).json({ error: 'Invalid recipients format' });
    }

    if (targetUsers.length === 0) {
      return res.status(400).json({ error: 'No valid recipients found' });
    }

    const notifications = [];
    const pushResults = [];

    // Create notifications in database
    for (const user of targetUsers) {
      const notification = new Notification({
        title,
        body,
        type,
        priority,
        recipient: user._id,
        sender: req.user.id,
        data
      });

      await notification.save();
      notifications.push(notification);

      // Send push notification if enabled and user has tokens
      if (sendPush && user.notificationSettings.pushEnabled) {
        const userTokens = user.getActiveFcmTokens();
        
        if (userTokens.length > 0) {
          const pushResult = await sendPushNotification(
            userTokens,
            { title, body },
            {
              notificationId: notification._id.toString(),
              type,
              priority,
              ...data
            }
          );

          if (pushResult.success) {
            await notification.markAsSent(null, pushResult.response);
          } else {
            await notification.markAsFailed(pushResult.error);
          }

          pushResults.push({
            userId: user._id,
            success: pushResult.success,
            tokenCount: userTokens.length,
            successCount: pushResult.successCount,
            failureCount: pushResult.failureCount
          });
        }
      }
    }

    res.json({
      success: true,
      message: `Notifications sent to ${targetUsers.length} users`,
      notificationCount: notifications.length,
      pushResults: sendPush ? pushResults : [],
      notifications: notifications.map(n => n.getPublicData())
    });

  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

/**
 * @route POST /api/notifications/send-to-user
 * @desc Send notification to specific user (Admin only)
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

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isAdmin) {
      return res.status(400).json({ error: 'Cannot send notifications to admin users' });
    }

    // Create notification in database
    const notification = new Notification({
      title,
      body,
      type,
      priority,
      recipient: userId,
      sender: req.user.id,
      data
    });

    await notification.save();

    let pushResult = null;

    // Send push notification if enabled
    if (sendPush && user.notificationSettings.pushEnabled) {
      const userTokens = user.getActiveFcmTokens();
      
      if (userTokens.length > 0) {
        pushResult = await sendPushNotification(
          userTokens,
          { title, body },
          {
            notificationId: notification._id.toString(),
            type,
            priority,
            ...data
          }
        );

        if (pushResult.success) {
          await notification.markAsSent(null, pushResult.response);
        } else {
          await notification.markAsFailed(pushResult.error);
        }
      }
    }

    res.json({
      success: true,
      message: 'Notification sent successfully',
      notification: notification.getPublicData(),
      pushResult: pushResult ? {
        success: pushResult.success,
        tokenCount: user.getActiveFcmTokens().length,
        successCount: pushResult.successCount,
        failureCount: pushResult.failureCount
      } : null
    });

  } catch (error) {
    console.error('Send notification to user error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

/**
 * @route PUT /api/notifications/:id/read
 * @desc Mark notification as read
 * @access Private (Regular Users and Admins)
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (!notification.isRead) {
      await notification.markAsRead();
      
      // Update in Firebase for real-time sync
      await updateNotificationInFirebase(req.user.id, notification._id.toString(), {
        isRead: true,
        readAt: notification.readAt.toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification: notification.getPublicData()
    });

  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * @route PUT /api/notifications/read-all
 * @desc Mark all notifications as read for current user
 * @access Private (Regular Users and Admins)
 */
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const result = await Notification.markAllAsReadForUser(req.user.id);

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
 * @desc Delete notification
 * @access Private (Regular Users and Admins)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await Notification.findByIdAndDelete(req.params.id);
    
    // Remove from Firebase for real-time sync
    await removeNotificationFromFirebase(req.user.id, req.params.id);

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
 * @desc Get notification statistics (Admin only)
 * @access Private (Admin only)
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalNotifications = await Notification.countDocuments();
    const unreadNotifications = await Notification.countDocuments({ isRead: false });
    const sentNotifications = await Notification.countDocuments({ status: 'sent' });
    const failedNotifications = await Notification.countDocuments({ status: 'failed' });

    // Notifications by type
    const notificationsByType = await Notification.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    // Notifications by priority
    const notificationsByPriority = await Notification.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentNotifications = await Notification.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    res.json({
      success: true,
      stats: {
        total: totalNotifications,
        unread: unreadNotifications,
        sent: sentNotifications,
        failed: failedNotifications,
        recent: recentNotifications,
        byType: notificationsByType,
        byPriority: notificationsByPriority
      }
    });

  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ error: 'Failed to fetch notification statistics' });
  }
});

/**
 * @route PUT /api/notifications/settings
 * @desc Update notification settings for current user
 * @access Private (Regular Users and Admins)
 */
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const { 
      pushEnabled, 
      messageNotifications, 
      systemNotifications, 
      announcementNotifications 
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const settings = {};
    if (typeof pushEnabled === 'boolean') settings.pushEnabled = pushEnabled;
    if (typeof messageNotifications === 'boolean') settings.messageNotifications = messageNotifications;
    if (typeof systemNotifications === 'boolean') settings.systemNotifications = systemNotifications;
    if (typeof announcementNotifications === 'boolean') settings.announcementNotifications = announcementNotifications;

    await user.updateNotificationSettings(settings);

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      settings: user.notificationSettings
    });

  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

module.exports = router;
