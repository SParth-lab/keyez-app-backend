const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPushNotification, getDatabase } = require('../config/firebase');

class NotificationService {
  /**
   * Push notification to Firebase for real-time updates
   * @param {String} userId - User ID
   * @param {Object} notification - Notification object
   */
  static async pushToFirebase(userId, notification) {
    try {
      if (!process.env.FIREBASE_PROJECT_ID) {
        console.log('⚠️  Firebase not configured - skipping real-time notification update');
        return false;
      }

      const database = getDatabase();
      if (!database) {
        console.warn('Firebase database not available');
        return false;
      }

      const notificationRef = database.ref(`notifications/${userId}`).push();
      await notificationRef.set({
        id: notification._id.toString(),
        title: notification.title,
        body: notification.body,
        type: notification.type,
        priority: notification.priority,
        isRead: notification.isRead,
        readAt: notification.readAt,
        createdAt: notification.createdAt.toISOString(),
        sender: notification.sender ? {
          id: notification.sender._id || notification.sender,
          username: notification.sender.username || 'System'
        } : { username: 'System' },
        data: notification.data || {},
        firebaseTimestamp: Date.now()
      });

      console.log(`✅ Notification pushed to Firebase for user: ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to push notification to Firebase:', error);
      return false;
    }
  }
  /**
   * Send notification when a new message is received
   * @param {Object} message - The message object
   * @param {Object} sender - The sender user object
   * @param {Object} recipient - The recipient user object
   */
  static async sendMessageNotification(message, sender, recipient) {
    try {
      // Only send notifications to regular users (not admins)
      if (recipient.isAdmin) {
        return { success: false, reason: 'Admin users do not receive message notifications' };
      }

      // Check if user has message notifications enabled
      if (!recipient.notificationSettings.messageNotifications) {
        return { success: false, reason: 'User has disabled message notifications' };
      }

      // Create notification in database
      const notification = new Notification({
        title: `New message from ${sender.username}`,
        body: message.text.length > 50 ? `${message.text.substring(0, 50)}...` : message.text,
        type: 'message',
        priority: 'normal',
        recipient: recipient._id,
        sender: sender._id,
        data: {
          messageId: message._id,
          senderId: sender._id,
          senderUsername: sender.username,
          chatPath: `chats/${[sender._id, recipient._id].sort().join('_')}`
        }
      });

      await notification.save();

      // Push to Firebase for real-time updates
      await this.pushToFirebase(recipient._id.toString(), notification);

      // Send push notification if enabled
      let pushResult = null;
      if (recipient.notificationSettings.pushEnabled) {
        const userTokens = recipient.getActiveFcmTokens();
        
        if (userTokens.length > 0) {
          pushResult = await sendPushNotification(
            userTokens,
            {
              title: notification.title,
              body: notification.body
            },
            {
              notificationId: notification._id.toString(),
              type: 'message',
              messageId: message._id.toString(),
              senderId: sender._id.toString(),
              senderUsername: sender.username,
              chatPath: notification.data.chatPath
            }
          );

          if (pushResult.success) {
            await notification.markAsSent(null, pushResult.response);
          } else {
            await notification.markAsFailed(pushResult.error);
          }
        }
      }

      return {
        success: true,
        notification: notification.getPublicData(),
        pushResult
      };

    } catch (error) {
      console.error('Error sending message notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send system notification to user(s)
   * @param {Array|String} recipients - Array of user IDs or 'all' for broadcast
   * @param {String} title - Notification title
   * @param {String} body - Notification body
   * @param {Object} options - Additional options
   */
  static async sendSystemNotification(recipients, title, body, options = {}) {
    try {
      const {
        type = 'system',
        priority = 'normal',
        data = {},
        sendPush = true,
        sender = null
      } = options;

      let targetUsers = [];
      
      if (recipients === 'all') {
        // Broadcast to all regular users
        targetUsers = await User.find({ isAdmin: false });
      } else if (Array.isArray(recipients)) {
        // Send to specific users
        targetUsers = await User.find({ 
          _id: { $in: recipients },
          isAdmin: false 
        });
      } else {
        return { success: false, error: 'Invalid recipients format' };
      }

      if (targetUsers.length === 0) {
        return { success: false, error: 'No valid recipients found' };
      }

      const notifications = [];
      const pushResults = [];

      for (const user of targetUsers) {
        // Check notification preferences
        const shouldSend = this.shouldSendNotification(user, type);
        if (!shouldSend) continue;

        const notification = new Notification({
          title,
          body,
          type,
          priority,
          recipient: user._id,
          sender,
          data
        });

        await notification.save();
        notifications.push(notification);

        // Push to Firebase for real-time updates
        await this.pushToFirebase(user._id.toString(), notification);

        // Send push notification if enabled
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

      return {
        success: true,
        notificationCount: notifications.length,
        pushResults: sendPush ? pushResults : [],
        notifications: notifications.map(n => n.getPublicData())
      };

    } catch (error) {
      console.error('Error sending system notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if notification should be sent based on user preferences
   * @param {Object} user - User object
   * @param {String} type - Notification type
   */
  static shouldSendNotification(user, type) {
    const settings = user.notificationSettings;

    switch (type) {
      case 'message':
        return settings.messageNotifications;
      case 'system':
        return settings.systemNotifications;
      case 'announcement':
        return settings.announcementNotifications;
      default:
        return true;
    }
  }

  /**
   * Clean up old notifications
   * @param {Number} daysOld - Delete notifications older than this many days
   */
  static async cleanupOldNotifications(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await Notification.deleteMany({
        createdAt: { $lt: cutoffDate },
        isRead: true
      });

      console.log(`✅ Cleaned up ${result.deletedCount} old notifications`);
      return { success: true, deletedCount: result.deletedCount };

    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get notification statistics
   */
  static async getNotificationStats() {
    try {
      const totalNotifications = await Notification.countDocuments();
      const unreadNotifications = await Notification.countDocuments({ isRead: false });
      const sentNotifications = await Notification.countDocuments({ status: 'sent' });
      const failedNotifications = await Notification.countDocuments({ status: 'failed' });

      // Get stats by type
      const statsByType = await Notification.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]);

      // Get stats by priority
      const statsByPriority = await Notification.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]);

      // Recent activity (last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const recentNotifications = await Notification.countDocuments({
        createdAt: { $gte: oneDayAgo }
      });

      return {
        success: true,
        stats: {
          total: totalNotifications,
          unread: unreadNotifications,
          sent: sentNotifications,
          failed: failedNotifications,
          recent: recentNotifications,
          byType: statsByType,
          byPriority: statsByPriority
        }
      };

    } catch (error) {
      console.error('Error getting notification stats:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService;
