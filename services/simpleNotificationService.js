const User = require('../models/User');
const { sendPushNotification } = require('../config/firebase');

class SimpleNotificationService {
  /**
   * Send FCM notification when a message is sent
   * @param {Object} message - The message object
   * @param {Object} sender - The sender user object
   * @param {Object} recipient - The recipient user object
   */
  static async sendMessageNotification(message, sender, recipient) {
    try {
      // Get recipient's FCM tokens
      const fcmTokens = recipient.getActiveFcmTokens();
      
      if (fcmTokens.length === 0) {
        console.log(`📱 No FCM tokens found for user: ${recipient.username}`);
        return { success: true, reason: 'No FCM tokens' };
      }

      // Create notification payload
      const title = `New message from ${sender.username}`;
      const body = message.text.length > 50 
        ? `${message.text.substring(0, 50)}...` 
        : message.text;

      const data = {
        type: 'message',
        messageId: message._id.toString(),
        senderId: sender._id.toString(),
        senderUsername: sender.username,
        chatType: 'direct'
      };

      // Send FCM notification
      const result = await sendPushNotification(fcmTokens, { title, body }, data);
      
      if (result.success) {
        console.log(`✅ FCM notification sent to ${recipient.username}`);
      } else {
        console.log(`❌ FCM notification failed for ${recipient.username}:`, result.error);
      }

      return result;

    } catch (error) {
      console.error('Error sending message notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send FCM notification when a group message is sent
   * @param {Object} message - The group message object
   * @param {Object} sender - The sender user object
   * @param {Object} group - The group object with populated members
   */
  static async sendGroupMessageNotification(message, sender, group) {
    try {
      // Get all group members except the sender
      const recipients = group.members.filter(member => 
        member._id.toString() !== sender._id.toString()
      );

      if (recipients.length === 0) {
        return { 
          success: true, 
          message: 'No recipients to notify',
          results: []
        };
      }

      const results = [];
      let successCount = 0;

      // Send notification to each member
      for (const member of recipients) {
        const fcmTokens = member.getActiveFcmTokens();
        
        if (fcmTokens.length === 0) {
          console.log(`📱 No FCM tokens found for user: ${member.username}`);
          results.push({
            userId: member._id,
            username: member.username,
            success: true,
            reason: 'No FCM tokens'
          });
          continue;
        }

        // Create notification payload
        const title = `New message in ${group.name}`;
        const body = `${sender.username}: ${message.text.length > 50 
          ? `${message.text.substring(0, 50)}...` 
          : message.text}`;

        const data = {
          type: 'message',
          messageId: message._id.toString(),
          groupId: group._id.toString(),
          groupName: group.name,
          senderId: sender._id.toString(),
          senderUsername: sender.username,
          chatType: 'group'
        };

        // Send FCM notification
        const result = await sendPushNotification(fcmTokens, { title, body }, data);
        
        if (result.success) {
          console.log(`✅ FCM group notification sent to ${member.username}`);
          successCount++;
        } else {
          console.log(`❌ FCM group notification failed for ${member.username}:`, result.error);
        }

        results.push({
          userId: member._id,
          username: member.username,
          success: result.success,
          error: result.error || null
        });
      }

      return {
        success: true,
        message: `Group notifications sent to ${successCount}/${recipients.length} members`,
        totalMembers: recipients.length,
        successCount,
        results
      };

    } catch (error) {
      console.error('Error sending group message notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send broadcast notification to all users
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} data - Additional notification data
   */
  static async sendBroadcastNotification(title, body, data = {}) {
    try {
      // Get all users with FCM tokens
      const users = await User.findUsersWithTokens();
      
      if (users.length === 0) {
        return { 
          success: true, 
          message: 'No users with FCM tokens found',
          results: []
        };
      }

      const results = [];
      let successCount = 0;

      // Send notification to each user
      for (const user of users) {
        const fcmTokens = user.getActiveFcmTokens();
        
        if (fcmTokens.length === 0) continue;

        const notificationData = {
          type: 'broadcast',
          ...data
        };

        // Send FCM notification
        const result = await sendPushNotification(fcmTokens, { title, body }, notificationData);
        
        if (result.success) {
          console.log(`✅ Broadcast notification sent to ${user.username}`);
          successCount++;
        } else {
          console.log(`❌ Broadcast notification failed for ${user.username}:`, result.error);
        }

        results.push({
          userId: user._id,
          username: user.username,
          success: result.success,
          error: result.error || null
        });
      }

      return {
        success: true,
        message: `Broadcast notifications sent to ${successCount}/${users.length} users`,
        totalUsers: users.length,
        successCount,
        results
      };

    } catch (error) {
      console.error('Error sending broadcast notification:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SimpleNotificationService;
