const express = require('express');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const GroupMessage = require('../models/GroupMessage');
const Group = require('../models/Group');
const User = require('../models/User');
const { getDatabase } = require('../config/firebase');
const SimpleNotificationService = require('../services/simpleNotificationService');
const firebaseUnreadService = require('../services/firebaseUnreadService');

const router = express.Router();

// Middleware to verify JWT token and get user
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Helper function to push 1:1 message to Firebase Realtime Database
const pushToFirebase = async (messageData) => {
  try {
    // Check if Firebase is configured
    if (!process.env.FIREBASE_PROJECT_ID) {
      console.log('⚠️  Firebase not configured - skipping real-time update');
      return;
    }

    const database = getDatabase();
    const { from, to, text, timestamp, imageUrl } = messageData;
    
    // Create chat path: chats/{fromId}_{toId} (sorted to ensure consistent path)
    const fromId = from.id || from.toString();
    const toId = to.id || to.toString();
    const chatPath = [fromId, toId].sort().join('_');
    const firebasePath = `chats/${chatPath}`;
    
    // Push message to Firebase with timestamp as key
    const messageRef = database.ref(firebasePath).push();
    await messageRef.set({
      id: messageData.id,
      from: messageData.from,
      to: messageData.to,
      text: messageData.text,
      timestamp: timestamp,
      imageUrl: messageData.imageUrl,
      formattedTimestamp: new Date(timestamp).toISOString()
    });

    console.log(`✅ Message pushed to Firebase: ${firebasePath}`);
    
  } catch (error) {
    console.error('❌ Failed to push to Firebase:', error);
    // Don't throw error to avoid breaking the main flow
  }
};

// Helper function to push group message to Firebase Realtime Database
const pushGroupToFirebase = async (groupMessageData) => {
  try {
    if (!process.env.FIREBASE_PROJECT_ID) {
      console.log('⚠️  Firebase not configured - skipping group real-time update');
      return;
    }

    const database = getDatabase();
    const { groupId } = groupMessageData;
    const firebasePath = `group_chats/${groupId}`;

    const messageRef = database.ref(firebasePath).push();
    await messageRef.set(groupMessageData);

    console.log(`✅ Group message pushed to Firebase: ${firebasePath}`);
  } catch (error) {
    console.error('❌ Failed to push group message to Firebase:', error);
  }
};

// Send message endpoint
router.post('/send', authenticateUser, async (req, res) => {
  try {
    const { to, text, imageUrl } = req.body;
    const from = req.user._id;

    // Validate input
    if (!to) {
      return res.status(400).json({ error: 'Recipient is required' });
    }
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const normalizedImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (!normalizedText && !normalizedImageUrl) {
      return res.status(400).json({ error: 'Either text or imageUrl is required' });
    }
    if (normalizedText && normalizedText.length > 1000) {
      return res.status(400).json({ error: 'Message cannot be more than 1000 characters' });
    }

    // Check if recipient exists
    const recipient = await User.findById(to);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Validation: If user (not admin), can send only to admin
    if (!req.user.isAdmin) {
      if (!recipient.isAdmin) {
        return res.status(403).json({ 
          error: 'Regular users can only send messages to administrators' 
        });
      }
    }

    // Validation: If admin, can send to any user
    // (No additional validation needed for admin)

    // Create and save message
    const message = new Message({
      from,
      to,
      text: normalizedText || undefined,
      imageUrl: normalizedImageUrl || undefined
    });

    await message.save();

    // Populate sender and recipient info for response
    await message.populate('from', 'username isAdmin avatar');
    await message.populate('to', 'username isAdmin avatar');

    console.log("🚀 ~ from:", message)
    // Prepare message data for Firebase
    const messageData = {
      id: message._id.toString(),
      from: {
        id: message.from._id.toString(),
        username: message.from.username,
        isAdmin: message.from.isAdmin,
        avatar: message.from.avatar || null
      },
      to: {
        id: message.to._id.toString(),
        username: message.to.username,
        isAdmin: message.to.isAdmin,
        avatar: message.to.avatar || null
      },
      text: message.text || null,
      imageUrl: message.imageUrl || null,
      timestamp: message.timestamp.getTime()
    };

    // Push to Firebase for real-time updates
    await pushToFirebase(messageData);

    // Increment unread count in Firebase for recipient
    await firebaseUnreadService.incrementDirectUnreadCount(to.toString(), from.toString());

    // Send FCM notification to recipient
    const notificationResult = await SimpleNotificationService.sendMessageNotification(
      message,
      req.user,
      recipient
    );

    res.status(201).json({
      message: 'Message sent successfully',
      data: message.getPublicData(),
      realtime: {
        firebasePath: `chats/${[from.toString(), to.toString()].sort().join('_')}`,
        messageId: message._id.toString()
      },
      notification: {
        sent: notificationResult.success,
        reason: notificationResult.reason || notificationResult.error || 'FCM notification sent'
      }
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Send group message (admin only)
router.post('/groups/:groupId/send', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { text, imageUrl } = req.body;

    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const normalizedImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (!normalizedText && !normalizedImageUrl) {
      return res.status(400).json({ error: 'Either text or imageUrl is required' });
    }
    if (normalizedText && normalizedText.length > 1000) {
      return res.status(400).json({ error: 'Message cannot be more than 1000 characters' });
    }

    const group = await Group.findById(groupId).populate('members', 'username isAdmin avatar fcmTokens');
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (!group.isActive) {
      return res.status(400).json({ error: 'Group is inactive' });
    }

    // Create and save message
    const message = new GroupMessage({
      group: groupId,
      from: req.user._id,
      text: normalizedText || undefined,
      imageUrl: normalizedImageUrl || undefined,
    });
    await message.save();
    await message.populate('from', 'username isAdmin avatar');

    const data = {
      id: message._id.toString(),
      groupId: groupId,
      from: {
        id: message.from._id.toString(),
        username: message.from.username,
        isAdmin: message.from.isAdmin,
        avatar: message.from.avatar || null,
      },
      text: message.text || null,
      imageUrl: message.imageUrl || null,
      timestamp: message.timestamp.getTime(),
    };

    await pushGroupToFirebase(data);

    // Increment unread count in Firebase for all group members except sender
    const memberIds = group.members.map(member => member._id.toString());
    await firebaseUnreadService.incrementGroupUnreadCount(groupId, req.user._id.toString(), memberIds);

    // Send FCM notifications to all group members except sender
    const notificationResult = await SimpleNotificationService.sendGroupMessageNotification(
      message,
      req.user,
      group
    );

    res.status(201).json({
      message: 'Group message sent successfully',
      data,
      realtime: {
        firebasePath: `group_chats/${groupId}`,
      },
      notifications: {
        sent: notificationResult.success,
        totalMembers: notificationResult.totalMembers || 0,
        successCount: notificationResult.successCount || 0,
        message: notificationResult.message || 'FCM notifications sent',
        error: notificationResult.error || null
      }
    });
  } catch (error) {
    console.error('Send group message error:', error);
    res.status(500).json({ error: 'Failed to send group message' });
  }
});

// Get group messages (admin only)
router.get('/groups/:groupId/messages', authenticateUser, async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate('members', '_id');
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Only group members can view messages
    // const isMember = group.members.some((m) => m._id.toString() === req.user._id.toString());
    // if (!isMember) {
    //   return res.status(403).json({ error: 'You must be a member of this group to view messages' });
    // }

    const messages = await GroupMessage.findByGroup(groupId);
    const formatted = messages.map((msg) => ({
      id: msg._id,
      from: {
        id: msg.from._id,
        username: msg.from.username,
        isAdmin: msg.from.isAdmin,
        avatar: msg.from.avatar || null,
      },
      text: msg.text,
      imageUrl: msg.imageUrl || null,
      timestamp: msg.timestamp,
      formattedTimestamp: msg.formattedTimestamp,
    }));

    res.json({
      messages: formatted,
      total: formatted.length,
      firebasePath: `group_chats/${groupId}`,
    });
  } catch (error) {
    console.error('Get group messages error:', error);
    res.status(500).json({ error: 'Failed to retrieve group messages' });
  }
});
// Get conversation history between current user and another user
router.get('/messages/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    // Validate that the target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validation: If current user is not admin, can only view conversations with admins
    if (!req.user.isAdmin) {
      if (!targetUser.isAdmin) {
        return res.status(403).json({ 
          error: 'Regular users can only view conversations with administrators' 
        });
      }
    }

    // Get conversation history
    const messages = await Message.findConversation(currentUserId, userId);

    // Format messages for response
    const formattedMessages = messages.map(msg => ({
      id: msg._id,
      from: {
        id: msg.from._id,
        username: msg.from.username,
        isAdmin: msg.from.isAdmin,
        avatar: msg.from.avatar || null
      },
      to: {
        id: msg.to._id,
        username: msg.to.username,
        isAdmin: msg.to.isAdmin,
        avatar: msg.to.avatar || null
      },
      text: msg.text,
      imageUrl: msg.imageUrl || null,
      timestamp: msg.timestamp,
      formattedTimestamp: msg.formattedTimestamp
    }));

    res.json({
      conversation: formattedMessages,
      total: formattedMessages.length,
      firebasePath: `chats/${[currentUserId.toString(), userId].sort().join('_')}`
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

// Get all conversations for current user
router.get('/conversations', authenticateUser, async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Get all messages for the current user
    const messages = await Message.findUserMessages(currentUserId);

    // Get unread counts for current user
    const unreadCounts = await Message.getUnreadCountsForUser(currentUserId);
    const unreadMap = {};
    unreadCounts.forEach(item => {
      unreadMap[item.partnerId.toString()] = {
        unreadCount: item.unreadCount,
        lastMessageTime: item.lastMessageTime
      };
    });

    // Group messages by conversation partner
    const conversations = {};
    
    messages.forEach(msg => {
      const partnerId = msg.from._id.toString() === currentUserId.toString() 
        ? msg.to._id.toString() 
        : msg.from._id.toString();
      
      if (!conversations[partnerId]) {
        conversations[partnerId] = {
          partner: msg.from._id.toString() === currentUserId.toString() 
            ? { id: msg.to._id, username: msg.to.username, isAdmin: msg.to.isAdmin }
            : { id: msg.from._id, username: msg.from.username, isAdmin: msg.from.isAdmin },
          lastMessage: null,
          messageCount: 0,
          unreadCount: unreadMap[partnerId]?.unreadCount || 0,
          lastMessageTime: unreadMap[partnerId]?.lastMessageTime || null,
          firebasePath: `chats/${[currentUserId.toString(), partnerId].sort().join('_')}`
        };
      }
      
      conversations[partnerId].messageCount++;
      
      // Update last message if this one is more recent
      if (!conversations[partnerId].lastMessage || 
          msg.timestamp > conversations[partnerId].lastMessage.timestamp) {
        conversations[partnerId].lastMessage = {
          text: msg.text || (msg.imageUrl ? '[Image]' : ''),
          imageUrl: msg.imageUrl || null,
          timestamp: msg.timestamp,
          formattedTimestamp: msg.formattedTimestamp
        };
      }
    });

    // Convert to array and sort by last message timestamp
    const conversationsArray = Object.values(conversations).sort((a, b) => {
      if (!a.lastMessage) return 1;
      if (!b.lastMessage) return -1;
      return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
    });

    res.json({
      conversations: conversationsArray,
      total: conversationsArray.length
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to retrieve conversations' });
  }
});

// Mark messages as read between current user and another user
router.put('/messages/:userId/mark-read', authenticateUser, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const otherUserId = req.params.userId;

    // Validate the other user exists
    const targetUser = await User.findById(otherUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Mark all messages from the other user to current user as read
    const result = await Message.markAsRead(otherUserId, currentUserId, currentUserId);

    // Clear unread count in Firebase for this conversation
    await firebaseUnreadService.clearDirectUnreadCount(currentUserId.toString(), otherUserId.toString());

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: 'Messages marked as read'
    });

  } catch (error) {
    console.error('Mark messages as read error:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// Get messages sent by current user
router.get('/sent', authenticateUser, async (req, res) => {
  try {
    const messages = await Message.findSentByUser(req.user._id);

    const formattedMessages = messages.map(msg => ({
      id: msg._id,
      to: {
        id: msg.to._id,
        username: msg.to.username,
        isAdmin: msg.to.isAdmin,
        avatar: msg.to.avatar || null
      },
      text: msg.text,
      timestamp: msg.timestamp,
      formattedTimestamp: msg.formattedTimestamp
    }));

    res.json({
      messages: formattedMessages,
      total: formattedMessages.length
    });

  } catch (error) {
    console.error('Get sent messages error:', error);
    res.status(500).json({ error: 'Failed to retrieve sent messages' });
  }
});

// Get messages received by current user
router.get('/received', authenticateUser, async (req, res) => {
  try {
    const messages = await Message.findReceivedByUser(req.user._id);

    const formattedMessages = messages.map(msg => ({
      id: msg._id,
      from: {
        id: msg.from._id,
        username: msg.from.username,
        isAdmin: msg.from.isAdmin,
        avatar: msg.from.avatar || null
      },
      text: msg.text,
      timestamp: msg.timestamp,
      formattedTimestamp: msg.formattedTimestamp
    }));

    res.json({
      messages: formattedMessages,
      total: formattedMessages.length
    });

  } catch (error) {
    console.error('Get received messages error:', error);
    res.status(500).json({ error: 'Failed to retrieve received messages' });
  }
});

// ===== FIREBASE UNREAD COUNT ENDPOINTS =====

// Get all unread counts for current user from Firebase
router.get('/unread-counts', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const unreadCounts = await firebaseUnreadService.getUserUnreadCounts(userId);
    
    res.json({
      success: true,
      data: unreadCounts
    });

  } catch (error) {
    console.error('Get unread counts error:', error);
    res.status(500).json({ error: 'Failed to get unread counts' });
  }
});

// Get total unread count for current user from Firebase
router.get('/unread-counts/total', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const totalCount = await firebaseUnreadService.getTotalUnreadCount(userId);
    
    res.json({
      success: true,
      totalUnreadCount: totalCount
    });

  } catch (error) {
    console.error('Get total unread count error:', error);
    res.status(500).json({ error: 'Failed to get total unread count' });
  }
});

// Get unread count for specific direct conversation from Firebase
router.get('/unread-counts/direct/:partnerId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const partnerId = req.params.partnerId;
    
    // Validate partner exists
    const partner = await User.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    const unreadCount = await firebaseUnreadService.getDirectUnreadCount(userId, partnerId);
    
    res.json({
      success: true,
      partnerId: partnerId,
      unreadCount: unreadCount
    });

  } catch (error) {
    console.error('Get direct unread count error:', error);
    res.status(500).json({ error: 'Failed to get direct unread count' });
  }
});

// Get unread count for specific group from Firebase
router.get('/unread-counts/group/:groupId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const groupId = req.params.groupId;
    
    // Validate group exists
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const unreadCount = await firebaseUnreadService.getGroupUnreadCount(userId, groupId);
    
    res.json({
      success: true,
      groupId: groupId,
      unreadCount: unreadCount
    });

  } catch (error) {
    console.error('Get group unread count error:', error);
    res.status(500).json({ error: 'Failed to get group unread count' });
  }
});

// Mark group messages as read (clear group unread count)
router.put('/groups/:groupId/mark-read', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const groupId = req.params.groupId;
    
    // Validate group exists
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Clear unread count in Firebase for this group
    await firebaseUnreadService.clearGroupUnreadCount(userId, groupId);
    
    res.json({
      success: true,
      message: 'Group messages marked as read'
    });

  } catch (error) {
    console.error('Mark group messages as read error:', error);
    res.status(500).json({ error: 'Failed to mark group messages as read' });
  }
});

// Clear all unread counts for current user
router.delete('/unread-counts', authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    await firebaseUnreadService.clearAllUnreadCounts(userId);
    
    res.json({
      success: true,
      message: 'All unread counts cleared'
    });

  } catch (error) {
    console.error('Clear all unread counts error:', error);
    res.status(500).json({ error: 'Failed to clear all unread counts' });
  }
});

module.exports = router; 