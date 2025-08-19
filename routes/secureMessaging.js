const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Group = require('../models/Group');
const SecureMessage = require('../models/SecureMessage');
const FirebaseNotificationService = require('../services/firebaseNotificationService');
const { getDatabase } = require('../config/firebase');

const router = express.Router();

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
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

    // Check if user is blocked
    if (user.isUserBlocked()) {
      return res.status(403).json({ 
        error: 'Account is blocked',
        blockReason: user.securityProfile.blockReason
      });
    }

    req.user = user;
    req.sessionToken = decoded.sessionToken;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to require admin role
const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Helper function to push message to Firebase for real-time updates
const pushMessageToFirebase = async (message, isGroupMessage = false) => {
  try {
    const database = getDatabase();
    if (!database) return false;

    if (isGroupMessage) {
      // Push to group chat path
      const groupRef = database.ref(`group_chats/${message.group}`).push();
      await groupRef.set({
        id: message._id.toString(),
        groupId: message.group.toString(),
        from: {
          id: message.from._id.toString(),
          phoneNumber: message.from.phoneNumber,
          isAdmin: message.from.isAdmin,
          avatar: message.from.avatar || null
        },
        content: message.getFormattedText(),
        messageType: message.content.messageType,
        restrictions: message.restrictions,
        timestamp: message.createdAt.getTime(),
        status: message.status
      });
    } else {
      // Push to 1:1 chat path
      const chatId = [message.from._id.toString(), message.to._id.toString()].sort().join('_');
      const chatRef = database.ref(`chats/${chatId}`).push();
      await chatRef.set({
        id: message._id.toString(),
        from: {
          id: message.from._id.toString(),
          phoneNumber: message.from.phoneNumber,
          isAdmin: message.from.isAdmin,
          avatar: message.from.avatar || null
        },
        to: {
          id: message.to._id.toString(),
          phoneNumber: message.to.phoneNumber,
          isAdmin: message.to.isAdmin,
          avatar: message.to.avatar || null
        },
        content: message.getFormattedText(),
        messageType: message.content.messageType,
        restrictions: message.restrictions,
        timestamp: message.createdAt.getTime(),
        status: message.status
      });
    }

    return true;
  } catch (error) {
    console.error('Failed to push message to Firebase:', error);
    return false;
  }
};

/**
 * @route POST /api/secure-messaging/send
 * @desc Send secure formatted message (Admin only)
 * @access Private (Admin only)
 */
router.post('/send', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { to, text, formatting, messageType, restrictions, priority, category, scheduleFor } = req.body;

    // Validate required fields
    if (!to || !text) {
      return res.status(400).json({ error: 'Recipient and message text are required' });
    }

    if (text.length > 2000) {
      return res.status(400).json({ error: 'Message cannot be more than 2000 characters' });
    }

    // Find recipient
    const recipient = await User.findById(to);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    if (recipient.isAdmin) {
      return res.status(400).json({ error: 'Cannot send secure messages to admin users' });
    }

    // Create secure message
    const message = new SecureMessage({
      from: req.user._id,
      to: recipient._id,
      content: {
        text: text.trim(),
        formatting: formatting || {},
        messageType: messageType || 'general'
      },
      restrictions: {
        copyable: restrictions?.copyable || false,
        forwardable: restrictions?.forwardable || false,
        screenshotAllowed: restrictions?.screenshotAllowed || false,
        expiresAt: restrictions?.expiresAt ? new Date(restrictions.expiresAt) : null
      },
      adminMetadata: {
        priority: priority || 'normal',
        category: category || 'personal',
        isSystemMessage: false,
        scheduleFor: scheduleFor ? new Date(scheduleFor) : null
      }
    });

    await message.save();
    await message.populate('from', 'username phoneNumber isAdmin avatar');
    await message.populate('to', 'username phoneNumber isAdmin avatar');

    // Push to Firebase for real-time updates
    const firebasePushed = await pushMessageToFirebase(message, false);

    // Send notification to recipient
    const notificationResult = await FirebaseNotificationService.sendMessageNotification(
      message,
      req.user,
      recipient
    );

    // Mark as delivered
    await message.markAsDelivered();

    res.status(201).json({
      success: true,
      message: 'Secure message sent successfully',
      data: message.getAdminData(),
      realtime: {
        firebasePushed,
        chatPath: `chats/${[req.user._id, recipient._id].sort().join('_')}`
      },
      notification: notificationResult.success ? {
        sent: true,
        notificationId: notificationResult.notification?.id,
        pushSent: notificationResult.pushResult?.success || false
      } : {
        sent: false,
        reason: notificationResult.reason || notificationResult.error
      }
    });

  } catch (error) {
    console.error('Send secure message error:', error);
    res.status(500).json({ error: 'Failed to send secure message' });
  }
});

/**
 * @route POST /api/secure-messaging/send-to-group
 * @desc Send secure message to group (Admin only)
 * @access Private (Admin only)
 */
router.post('/send-to-group', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { groupId, text, formatting, messageType, restrictions, priority, category } = req.body;

    // Validate required fields
    if (!groupId || !text) {
      return res.status(400).json({ error: 'Group ID and message text are required' });
    }

    if (text.length > 2000) {
      return res.status(400).json({ error: 'Message cannot be more than 2000 characters' });
    }

    // Find group
    const group = await Group.findById(groupId).populate('members', 'username phoneNumber isAdmin avatar fcmTokens notificationSettings');
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!group.isActive) {
      return res.status(400).json({ error: 'Group is inactive' });
    }

    // Check if admin is member of group
    const isMember = group.members.some(member => member._id.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ error: 'You must be a member of this group' });
    }

    // Create secure message
    const message = new SecureMessage({
      from: req.user._id,
      group: group._id,
      content: {
        text: text.trim(),
        formatting: formatting || {},
        messageType: messageType || 'general'
      },
      restrictions: {
        copyable: restrictions?.copyable || false,
        forwardable: restrictions?.forwardable || false,
        screenshotAllowed: restrictions?.screenshotAllowed || false,
        expiresAt: restrictions?.expiresAt ? new Date(restrictions.expiresAt) : null
      },
      adminMetadata: {
        priority: priority || 'normal',
        category: category || 'personal',
        isSystemMessage: false
      }
    });

    await message.save();
    await message.populate('from', 'username phoneNumber isAdmin avatar');
    await message.populate('group', 'name description');

    // Push to Firebase for real-time updates
    const firebasePushed = await pushMessageToFirebase(message, true);

    // Send notifications to all group members except sender
    const notificationResult = await FirebaseNotificationService.sendGroupMessageNotification(
      message,
      req.user,
      group
    );

    // Mark as delivered
    await message.markAsDelivered();

    res.status(201).json({
      success: true,
      message: 'Secure group message sent successfully',
      data: message.getAdminData(),
      realtime: {
        firebasePushed,
        groupPath: `group_chats/${groupId}`
      },
      notifications: notificationResult.success ? {
        sent: true,
        totalNotifications: notificationResult.totalNotifications,
        successfulNotifications: notificationResult.successfulNotifications,
        details: notificationResult.results
      } : {
        sent: false,
        error: notificationResult.error
      }
    });

  } catch (error) {
    console.error('Send secure group message error:', error);
    res.status(500).json({ error: 'Failed to send secure group message' });
  }
});

/**
 * @route GET /api/secure-messaging/conversation/:userId
 * @desc Get secure conversation with specific user
 * @access Private
 */
router.get('/conversation/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Validate user access (users can only see their own conversations, admins can see all)
    if (!req.user.isAdmin && userId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await SecureMessage.findConversation(req.user._id, userId, { page, limit });

    // Filter data based on user role
    const responseData = messages.map(message => {
      if (req.user.isAdmin) {
        return message.getAdminData();
      } else {
        // For regular users, check if message is expired
        if (message.isExpired()) {
          return {
            id: message._id,
            expired: true,
            createdAt: message.createdAt
          };
        }
        return message.getPublicData();
      }
    });

    res.json({
      success: true,
      conversation: responseData,
      pagination: {
        currentPage: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * @route GET /api/secure-messaging/group/:groupId
 * @desc Get secure group messages
 * @access Private
 */
router.get('/group/:groupId', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Check if user is member of group
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const isMember = group.members.some(member => member.toString() === req.user._id.toString());
    if (!isMember && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await SecureMessage.findGroupMessages(groupId, { page, limit });

    // Filter data based on user role
    const responseData = messages.map(message => {
      if (req.user.isAdmin) {
        return message.getAdminData();
      } else {
        // For regular users, check if message is expired
        if (message.isExpired()) {
          return {
            id: message._id,
            expired: true,
            createdAt: message.createdAt
          };
        }
        return message.getPublicData();
      }
    });

    res.json({
      success: true,
      messages: responseData,
      group: {
        id: group._id,
        name: group.name,
        description: group.description
      },
      pagination: {
        currentPage: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get group messages error:', error);
    res.status(500).json({ error: 'Failed to get group messages' });
  }
});

/**
 * @route PUT /api/secure-messaging/:messageId/read
 * @desc Mark message as read
 * @access Private
 */
router.put('/:messageId/read', authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await SecureMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is recipient
    const isRecipient = message.to && message.to.toString() === req.user._id.toString();
    const isGroupMember = message.group && await Group.findOne({
      _id: message.group,
      members: req.user._id
    });

    if (!isRecipient && !isGroupMember && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if message is expired
    if (message.isExpired()) {
      return res.status(410).json({ error: 'Message has expired' });
    }

    await message.markAsRead();

    res.json({
      success: true,
      message: 'Message marked as read',
      readAt: message.readAt
    });

  } catch (error) {
    console.error('Mark message as read error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

/**
 * @route GET /api/secure-messaging/security-violations
 * @desc Get messages with security violations (Admin only)
 * @access Private (Admin only)
 */
router.get('/security-violations', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    const messages = await SecureMessage.findMessagesWithViolations();
    
    // Paginate results
    const skip = (page - 1) * limit;
    const paginatedMessages = messages.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      messages: paginatedMessages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(messages.length / limit),
        totalCount: messages.length,
        hasMore: skip + paginatedMessages.length < messages.length
      }
    });

  } catch (error) {
    console.error('Get security violations error:', error);
    res.status(500).json({ error: 'Failed to get security violations' });
  }
});

/**
 * @route DELETE /api/secure-messaging/cleanup-expired
 * @desc Clean up expired messages (Admin only - scheduled job)
 * @access Private (Admin only)
 */
router.delete('/cleanup-expired', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const result = await SecureMessage.cleanupExpiredMessages();
    
    res.json({
      success: true,
      message: 'Expired messages cleaned up',
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Cleanup expired messages error:', error);
    res.status(500).json({ error: 'Failed to cleanup expired messages' });
  }
});

module.exports = router;
