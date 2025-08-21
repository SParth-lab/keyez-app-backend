const User = require('../models/User');
const { sendPushNotification, getDatabase } = require('../config/firebase');

class FirebaseNotificationService {
  /**
   * Generate unique notification ID
   */
  static generateNotificationId() {
    return Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Create notification object structure
   */
  static createNotificationData(title, body, options = {}) {
    const {
      type = 'system',
      priority = 'normal',
      sender = null,
      data = {}
    } = options;

    return {
      id: this.generateNotificationId(),
      title,
      body,
      type,
      priority,
      sender: sender ? {
        id: sender._id || sender,
        username: sender.username || 'System'
      } : { username: 'System' },
      data,
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
  }

  /**
   * Save notification to Firebase Realtime Database
   */
  static async saveToFirebase(userId, notification) {
    try {
      if (!process.env.FIREBASE_PROJECT_ID) {
        console.log('⚠️  Firebase not configured - skipping notification save');
        return { success: false, error: 'Firebase not configured' };
      }

      const database = getDatabase();
      if (!database) {
        return { success: false, error: 'Firebase database not available' };
      }

      const notificationRef = database.ref(`notifications/${userId}/${notification.id}`);
      await notificationRef.set(notification);

      console.log(`✅ Notification saved to Firebase for user: ${userId}`);
      return { success: true, notification };

    } catch (error) {
      console.error('❌ Failed to save notification to Firebase:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send message notification to recipient
   */
  static async sendMessageNotification(message, sender, recipient) {
    try {
      // Determine notification handling based on recipient type
      let shouldSendPushNotification = true;
      let notificationTitle;
      let notificationData;

      if (recipient.isAdmin) {
        // Admin receiving message from user - store in Firebase for web interface
        notificationTitle = `New message from ${sender.username}`;
        shouldSendPushNotification = false; // Admins don't get mobile push notifications
        notificationData = {
          messageId: message._id,
          senderId: sender._id,
          senderUsername: sender.username,
          senderAvatar: sender.avatar || null,
          chatPath: `chats/${[sender._id, recipient._id].sort().join('_')}`,
          isFromRegularUser: true
        };
      } else {
        // Regular user receiving message - send both Firebase and push notification
        notificationTitle = `New message from ${sender.username}`;
        shouldSendPushNotification = true; // Regular users get push notifications by default
        notificationData = {
          messageId: message._id,
          senderId: sender._id,
          senderUsername: sender.username,
          senderAvatar: sender.avatar || null,
          chatPath: `chats/${[sender._id, recipient._id].sort().join('_')}`,
          isFromAdmin: sender.isAdmin
        };
      }

      // Create notification data
      const notification = this.createNotificationData(
        notificationTitle,
        message.text.length > 50 ? `${message.text.substring(0, 50)}...` : message.text,
        {
          type: 'message',
          priority: 'normal',
          sender: sender,
          data: notificationData
        }
      );

      // Save to Firebase
      const saveResult = await this.saveToFirebase(recipient._id.toString(), notification);
      if (!saveResult.success) {
        return saveResult;
      }

      // Send push notification if enabled and recipient is not admin
      let pushResult = null;
      if (shouldSendPushNotification && !recipient.isAdmin) {
        const userTokens = recipient.getActiveFcmTokens();
        
        if (userTokens.length > 0) {
          pushResult = await sendPushNotification(
            userTokens,
            {
              title: notification.title,
              body: notification.body
            },
            {
              notificationId: notification.id,
              type: 'message',
              messageId: message._id.toString(),
              senderId: sender._id.toString(),
              senderUsername: sender.username,
              chatPath: notificationData.chatPath,
              isFromAdmin: sender.isAdmin
            }
          );

          // Update status in Firebase
          if (pushResult.success) {
            await this.updateNotificationStatus(recipient._id.toString(), notification.id, 'sent');
          } else {
            await this.updateNotificationStatus(recipient._id.toString(), notification.id, 'failed');
          }
        }
      } else if (recipient.isAdmin) {
        // For admin users, just mark as delivered since we're storing in Firebase for web interface
        await this.updateNotificationStatus(recipient._id.toString(), notification.id, 'delivered');
      }

      return {
        success: true,
        notification,
        pushResult
      };

    } catch (error) {
      console.error('Error sending message notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to group members when a new group message is sent
   */
  static async sendGroupMessageNotification(message, sender, group) {
    try {
      const results = [];
      let totalNotifications = 0;
      let successfulNotifications = 0;

      // Get all group members except the sender
      const recipients = group.members.filter(member => 
        member._id.toString() !== sender._id.toString()
      );

      if (recipients.length === 0) {
        return { 
          success: true, 
          message: 'No recipients to notify',
          totalNotifications: 0,
          successfulNotifications: 0,
          results: []
        };
      }

      for (const member of recipients) {
        totalNotifications++;

        // All members get notifications by default

        // Determine notification handling based on member type
        let shouldSendPushNotification = true;
        let notificationTitle = `New message in ${group.name}`;
        let notificationBody = `${sender.username}: ${message.text.length > 50 ? `${message.text.substring(0, 50)}...` : message.text}`;
        
        const notificationData = {
          messageId: message._id,
          groupId: group._id,
          groupName: group.name,
          senderId: sender._id,
          senderUsername: sender.username,
          senderAvatar: sender.avatar || null,
          groupPath: `group_chats/${group._id}`,
          isFromAdmin: sender.isAdmin,
          memberCount: group.members.length
        };

        if (member.isAdmin) {
          // Admin receiving group message - store in Firebase for web interface only
          shouldSendPushNotification = false;
        } else {
          // Regular user receiving group message - send both Firebase and push notification
          shouldSendPushNotification = true; // Regular users get push notifications by default
        }

        // Create notification data
        const notification = this.createNotificationData(
          notificationTitle,
          notificationBody,
          {
            type: 'message',
            priority: 'normal',
            sender: sender,
            data: notificationData
          }
        );

        // Save to Firebase
        const saveResult = await this.saveToFirebase(member._id.toString(), notification);
        if (!saveResult.success) {
          results.push({
            userId: member._id,
            username: member.username,
            success: false,
            error: saveResult.error
          });
          continue;
        }

        // Send push notification if enabled and member is not admin
        let pushResult = null;
        if (shouldSendPushNotification && !member.isAdmin) {
          const userTokens = member.getActiveFcmTokens();
          
          if (userTokens.length > 0) {
            pushResult = await sendPushNotification(
              userTokens,
              {
                title: notification.title,
                body: notification.body
              },
              {
                notificationId: notification.id,
                type: 'message',
                messageId: message._id.toString(),
                groupId: group._id.toString(),
                groupName: group.name,
                senderId: sender._id.toString(),
                senderUsername: sender.username,
                groupPath: notificationData.groupPath,
                isFromAdmin: sender.isAdmin
              }
            );

            // Update status in Firebase
            if (pushResult.success) {
              await this.updateNotificationStatus(member._id.toString(), notification.id, 'sent');
            } else {
              await this.updateNotificationStatus(member._id.toString(), notification.id, 'failed');
            }
          }
        } else if (member.isAdmin) {
          // For admin users, just mark as delivered since we're storing in Firebase for web interface
          await this.updateNotificationStatus(member._id.toString(), notification.id, 'delivered');
        }

        successfulNotifications++;
        results.push({
          userId: member._id,
          username: member.username,
          success: true,
          notification: notification.getPublicData ? notification.getPublicData() : notification,
          pushSent: pushResult?.success || false
        });
      }

      return {
        success: true,
        message: `Group notifications sent to ${successfulNotifications}/${totalNotifications} members`,
        totalNotifications,
        successfulNotifications,
        results
      };

    } catch (error) {
      console.error('Error sending group message notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to specific user
   */
  static async sendToUser(userId, title, body, options = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (user.isAdmin) {
        return { success: false, error: 'Cannot send notifications to admin users' };
      }

      // Check notification preferences
      const shouldSend = this.shouldSendNotification(user, options.type || 'system');
      if (!shouldSend) {
        return { success: false, reason: 'User has disabled this type of notification' };
      }

      // Create notification data
      const notification = this.createNotificationData(title, body, options);

      // Save to Firebase
      const saveResult = await this.saveToFirebase(userId, notification);
      if (!saveResult.success) {
        return saveResult;
      }

      // Send push notification if enabled
      let pushResult = null;
      if (options.sendPush !== false) {
        const userTokens = user.getActiveFcmTokens();
        
        if (userTokens.length > 0) {
          pushResult = await sendPushNotification(
            userTokens,
            { title, body },
            {
              notificationId: notification.id,
              type: options.type || 'system',
              priority: options.priority || 'normal',
              ...options.data || {}
            }
          );

          // Update status in Firebase
          if (pushResult.success) {
            await this.updateNotificationStatus(userId, notification.id, 'sent');
          } else {
            await this.updateNotificationStatus(userId, notification.id, 'failed');
          }
        }
      }

      return {
        success: true,
        notification,
        pushResult
      };

    } catch (error) {
      console.error('Error sending notification to user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to multiple users
   */
  static async sendToUsers(recipients, title, body, options = {}) {
    try {
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

      const results = [];
      
      for (const user of targetUsers) {
        const result = await this.sendToUser(user._id.toString(), title, body, options);
        results.push({
          userId: user._id,
          username: user.username,
          ...result
        });
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      return {
        success: true,
        totalUsers: targetUsers.length,
        successCount,
        failureCount,
        results
      };

    } catch (error) {
      console.error('Error sending notifications to users:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get notifications for a user from Firebase
   */
  static async getNotificationsForUser(userId, options = {}) {
    try {
      if (!process.env.FIREBASE_PROJECT_ID) {
        return { success: false, error: 'Firebase not configured' };
      }

      const database = getDatabase();
      if (!database) {
        return { success: false, error: 'Firebase database not available' };
      }

      const notificationsRef = database.ref(`notifications/${userId}`);
      const snapshot = await notificationsRef.once('value');
      const notificationsData = snapshot.val() || {};

      // Convert to array and apply filters
      let notifications = Object.values(notificationsData);

      // Apply filters
      if (options.unreadOnly) {
        notifications = notifications.filter(n => !n.isRead);
      }
      if (options.type) {
        notifications = notifications.filter(n => n.type === options.type);
      }
      if (options.priority) {
        notifications = notifications.filter(n => n.priority === options.priority);
      }

      // Sort by creation time (newest first)
      notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Apply pagination
      const page = options.page || 1;
      const limit = options.limit || 20;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedNotifications = notifications.slice(startIndex, endIndex);

      // Get unread count
      const unreadCount = notifications.filter(n => !n.isRead).length;

      return {
        success: true,
        notifications: paginatedNotifications,
        pagination: {
          page,
          limit,
          total: notifications.length,
          hasMore: endIndex < notifications.length
        },
        unreadCount
      };

    } catch (error) {
      console.error('Error getting notifications for user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(userId, notificationId) {
    try {
      if (!process.env.FIREBASE_PROJECT_ID) {
        return { success: false, error: 'Firebase not configured' };
      }

      const database = getDatabase();
      if (!database) {
        return { success: false, error: 'Firebase database not available' };
      }

      const notificationRef = database.ref(`notifications/${userId}/${notificationId}`);
      const snapshot = await notificationRef.once('value');
      
      if (!snapshot.exists()) {
        return { success: false, error: 'Notification not found' };
      }

      await notificationRef.update({
        isRead: true,
        readAt: new Date().toISOString()
      });

      console.log(`✅ Notification ${notificationId} marked as read for user ${userId}`);
      return { success: true };

    } catch (error) {
      console.error('Error marking notification as read:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId) {
    try {
      if (!process.env.FIREBASE_PROJECT_ID) {
        return { success: false, error: 'Firebase not configured' };
      }

      const database = getDatabase();
      if (!database) {
        return { success: false, error: 'Firebase database not available' };
      }

      const notificationsRef = database.ref(`notifications/${userId}`);
      const snapshot = await notificationsRef.once('value');
      const notifications = snapshot.val() || {};

      const updates = {};
      let count = 0;
      
      for (const [notificationId, notification] of Object.entries(notifications)) {
        if (!notification.isRead) {
          updates[`${notificationId}/isRead`] = true;
          updates[`${notificationId}/readAt`] = new Date().toISOString();
          count++;
        }
      }

      if (count > 0) {
        await notificationsRef.update(updates);
      }

      console.log(`✅ Marked ${count} notifications as read for user ${userId}`);
      return { success: true, modifiedCount: count };

    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete notification
   */
  static async deleteNotification(userId, notificationId) {
    try {
      if (!process.env.FIREBASE_PROJECT_ID) {
        return { success: false, error: 'Firebase not configured' };
      }

      const database = getDatabase();
      if (!database) {
        return { success: false, error: 'Firebase database not available' };
      }

      const notificationRef = database.ref(`notifications/${userId}/${notificationId}`);
      const snapshot = await notificationRef.once('value');
      
      if (!snapshot.exists()) {
        return { success: false, error: 'Notification not found' };
      }

      await notificationRef.remove();

      console.log(`✅ Notification ${notificationId} deleted for user ${userId}`);
      return { success: true };

    } catch (error) {
      console.error('Error deleting notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update notification status in Firebase
   */
  static async updateNotificationStatus(userId, notificationId, status) {
    try {
      if (!process.env.FIREBASE_PROJECT_ID) {
        return false;
      }

      const database = getDatabase();
      if (!database) {
        return false;
      }

      const notificationRef = database.ref(`notifications/${userId}/${notificationId}`);
      await notificationRef.update({
        status,
        ...(status === 'sent' && { sentAt: new Date().toISOString() }),
        ...(status === 'delivered' && { deliveredAt: new Date().toISOString() })
      });

      return true;

    } catch (error) {
      console.error('Error updating notification status:', error);
      return false;
    }
  }

  /**
   * Get notification statistics
   */
  static async getNotificationStats() {
    try {
      if (!process.env.FIREBASE_PROJECT_ID) {
        return { success: false, error: 'Firebase not configured' };
      }

      const database = getDatabase();
      if (!database) {
        return { success: false, error: 'Firebase database not available' };
      }

      const notificationsRef = database.ref('notifications');
      const snapshot = await notificationsRef.once('value');
      const allNotifications = snapshot.val() || {};

      let totalNotifications = 0;
      let unreadNotifications = 0;
      let sentNotifications = 0;
      let failedNotifications = 0;
      let recentNotifications = 0;
      const byType = {};
      const byPriority = {};

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      // Process all notifications from all users
      for (const userId in allNotifications) {
        const userNotifications = allNotifications[userId];
        
        for (const notificationId in userNotifications) {
          const notification = userNotifications[notificationId];
          
          totalNotifications++;
          
          if (!notification.isRead) unreadNotifications++;
          if (notification.status === 'sent') sentNotifications++;
          if (notification.status === 'failed') failedNotifications++;
          
          if (new Date(notification.createdAt) >= oneDayAgo) {
            recentNotifications++;
          }
          
          // Count by type
          byType[notification.type] = (byType[notification.type] || 0) + 1;
          
          // Count by priority
          byPriority[notification.priority] = (byPriority[notification.priority] || 0) + 1;
        }
      }

      // Convert objects to arrays for frontend
      const statsByType = Object.entries(byType).map(([type, count]) => ({ _id: type, count }));
      const statsByPriority = Object.entries(byPriority).map(([priority, count]) => ({ _id: priority, count }));

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

  /**
   * Check if notification should be sent based on user preferences
   * Simplified - all notifications are enabled by default
   */
  static shouldSendNotification(user, type) {
    // All notifications are enabled by default since we removed notificationSettings
    return true;
  }

  /**
   * Clean up old notifications (older than specified days)
   */
  static async cleanupOldNotifications(daysOld = 30) {
    try {
      if (!process.env.FIREBASE_PROJECT_ID) {
        return { success: false, error: 'Firebase not configured' };
      }

      const database = getDatabase();
      if (!database) {
        return { success: false, error: 'Firebase database not available' };
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const notificationsRef = database.ref('notifications');
      const snapshot = await notificationsRef.once('value');
      const allNotifications = snapshot.val() || {};

      let deletedCount = 0;
      const updates = {};

      // Find notifications to delete
      for (const userId in allNotifications) {
        const userNotifications = allNotifications[userId];
        
        for (const notificationId in userNotifications) {
          const notification = userNotifications[notificationId];
          
          if (notification.isRead && new Date(notification.createdAt) < cutoffDate) {
            updates[`${userId}/${notificationId}`] = null; // null deletes the node in Firebase
            deletedCount++;
          }
        }
      }

      if (deletedCount > 0) {
        await notificationsRef.update(updates);
      }

      console.log(`✅ Cleaned up ${deletedCount} old notifications`);
      return { success: true, deletedCount };

    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = FirebaseNotificationService;
