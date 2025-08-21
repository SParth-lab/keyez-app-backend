#!/usr/bin/env node

/**
 * Test Script for Real-time Messaging System
 * 
 * This script tests the Firebase real-time messaging functionality
 * including 1:1 chats, group chats, and notification system.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { initializeFirebase, getDatabase } = require('../config/firebase');

// Import models
const User = require('../models/User');
const Message = require('../models/Message');
const GroupMessage = require('../models/GroupMessage');
const Group = require('../models/Group');

// Import services
const FirebaseNotificationService = require('../services/firebaseNotificationService');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = (color, message) => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

class RealTimeMessagingTest {
  constructor() {
    this.database = null;
    this.testUsers = [];
    this.testGroup = null;
    this.adminUser = null;
  }

  async initialize() {
    try {
      log('cyan', '🔧 Initializing Real-time Messaging Test...\n');

      // Connect to MongoDB
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/keyez-app');
      log('green', '✅ Connected to MongoDB');

      // Initialize Firebase
      const firebaseApp = await initializeFirebase();
      if (!firebaseApp) {
        throw new Error('Firebase initialization failed');
      }
      this.database = getDatabase();
      log('green', '✅ Connected to Firebase Realtime Database');

      log('green', '✅ Initialization complete\n');
      return true;

    } catch (error) {
      log('red', `❌ Initialization failed: ${error.message}`);
      return false;
    }
  }

  async createTestUsers() {
    try {
      log('yellow', '👥 Creating test users...');

      // Create admin user
      this.adminUser = await User.findOneAndUpdate(
        { username: 'testadmin' },
        {
          username: 'testadmin',
          password: 'password123',
          email: 'admin@test.com',
          isAdmin: true,
          fcmTokens: [{
            token: 'admin_test_token_123',
            deviceType: 'web',
            deviceId: 'admin_device_1'
          }]
        },
        { upsert: true, new: true }
      );

      // Create test users
      for (let i = 1; i <= 3; i++) {
        const user = await User.findOneAndUpdate(
          { phoneNumber: `+1555000000${i}` },
          {
            phoneNumber: `+1555000000${i}`,
            isAdmin: false,
            fcmTokens: [{
              token: `user_${i}_test_token_123`,
              deviceType: 'android',
              deviceId: `user_${i}_device_1`
            }]
          },
          { upsert: true, new: true }
        );
        
        this.testUsers.push(user);
      }

      log('green', `✅ Created ${this.testUsers.length} test users and 1 admin`);
      return true;

    } catch (error) {
      log('red', `❌ Failed to create test users: ${error.message}`);
      return false;
    }
  }

  async createTestGroup() {
    try {
      log('yellow', '👥 Creating test group...');

      // Create test group with admin and users
      const groupMembers = [this.adminUser._id, ...this.testUsers.map(u => u._id)];
      
      this.testGroup = await Group.findOneAndUpdate(
        { name: 'Test Group Chat' },
        {
          name: 'Test Group Chat',
          description: 'A test group for real-time messaging',
          members: groupMembers,
          createdBy: this.adminUser._id,
          isActive: true
        },
        { upsert: true, new: true }
      ).populate('members', 'username phoneNumber isAdmin');

      log('green', `✅ Created test group with ${this.testGroup.members.length} members`);
      return true;

    } catch (error) {
      log('red', `❌ Failed to create test group: ${error.message}`);
      return false;
    }
  }

  async testDirectMessaging() {
    try {
      log('magenta', '\n📱 Testing Direct Messaging (User → Admin)...');

      const user = this.testUsers[0];
      const messageText = `Hello Admin! This is a test message from ${user.phoneNumber} at ${new Date().toLocaleTimeString()}`;

      // Create and save message
      const message = new Message({
        from: user._id,
        to: this.adminUser._id,
        text: messageText
      });
      await message.save();
      await message.populate('from to', 'username phoneNumber isAdmin avatar');

      // Push to Firebase
      const chatPath = [user._id.toString(), this.adminUser._id.toString()].sort().join('_');
      const firebaseMessageData = {
        id: message._id.toString(),
        from: {
          id: user._id.toString(),
          username: user.phoneNumber,
          isAdmin: user.isAdmin,
          avatar: user.avatar || null
        },
        to: {
          id: this.adminUser._id.toString(),
          username: this.adminUser.username,
          isAdmin: this.adminUser.isAdmin,
          avatar: this.adminUser.avatar || null
        },
        text: message.text,
        timestamp: message.timestamp.getTime(),
        formattedTimestamp: message.timestamp.toISOString()
      };

      // Push to Firebase
      const messageRef = this.database.ref(`chats/${chatPath}`).push();
      await messageRef.set(firebaseMessageData);

      log('green', `✅ Direct message sent: ${messageText.substring(0, 50)}...`);
      log('blue', `   📍 Firebase path: chats/${chatPath}`);
      log('blue', `   🆔 Message ID: ${message._id}`);

      // Test notification
      const notificationResult = await FirebaseNotificationService.sendMessageNotification(
        message,
        user,
        this.adminUser
      );

      if (notificationResult.success) {
        log('green', '✅ Admin notification sent successfully');
      } else {
        log('yellow', `⚠️ Admin notification: ${notificationResult.reason || notificationResult.error}`);
      }

      return true;

    } catch (error) {
      log('red', `❌ Direct messaging test failed: ${error.message}`);
      return false;
    }
  }

  async testAdminToUserMessaging() {
    try {
      log('magenta', '\n👨‍💼 Testing Admin → User Messaging...');

      const user = this.testUsers[1];
      const messageText = `Hello ${user.phoneNumber}! This is a response from admin at ${new Date().toLocaleTimeString()}`;

      // Create and save message
      const message = new Message({
        from: this.adminUser._id,
        to: user._id,
        text: messageText
      });
      await message.save();
      await message.populate('from to', 'username phoneNumber isAdmin avatar');

      // Push to Firebase
      const chatPath = [this.adminUser._id.toString(), user._id.toString()].sort().join('_');
      const firebaseMessageData = {
        id: message._id.toString(),
        from: {
          id: this.adminUser._id.toString(),
          username: this.adminUser.username,
          isAdmin: this.adminUser.isAdmin,
          avatar: this.adminUser.avatar || null
        },
        to: {
          id: user._id.toString(),
          username: user.phoneNumber,
          isAdmin: user.isAdmin,
          avatar: user.avatar || null
        },
        text: message.text,
        timestamp: message.timestamp.getTime(),
        formattedTimestamp: message.timestamp.toISOString()
      };

      const messageRef = this.database.ref(`chats/${chatPath}`).push();
      await messageRef.set(firebaseMessageData);

      log('green', `✅ Admin message sent: ${messageText.substring(0, 50)}...`);
      log('blue', `   📍 Firebase path: chats/${chatPath}`);

      // Test notification to user
      const notificationResult = await FirebaseNotificationService.sendMessageNotification(
        message,
        this.adminUser,
        user
      );

      if (notificationResult.success) {
        log('green', '✅ User push notification sent successfully');
      } else {
        log('yellow', `⚠️ User notification: ${notificationResult.reason || notificationResult.error}`);
      }

      return true;

    } catch (error) {
      log('red', `❌ Admin to user messaging test failed: ${error.message}`);
      return false;
    }
  }

  async testGroupMessaging() {
    try {
      log('magenta', '\n👥 Testing Group Messaging...');

      const messageText = `📢 Group announcement from admin at ${new Date().toLocaleTimeString()}. This is a test group message to all members!`;

      // Create and save group message
      const groupMessage = new GroupMessage({
        group: this.testGroup._id,
        from: this.adminUser._id,
        text: messageText
      });
      await groupMessage.save();
      await groupMessage.populate('from', 'username isAdmin avatar');

      // Push to Firebase
      const groupPath = `group_chats/${this.testGroup._id}`;
      const firebaseMessageData = {
        id: groupMessage._id.toString(),
        groupId: this.testGroup._id.toString(),
        from: {
          id: this.adminUser._id.toString(),
          username: this.adminUser.username,
          isAdmin: this.adminUser.isAdmin,
          avatar: this.adminUser.avatar || null
        },
        text: groupMessage.text,
        timestamp: groupMessage.timestamp.getTime(),
        formattedTimestamp: groupMessage.timestamp.toISOString()
      };

      const messageRef = this.database.ref(groupPath).push();
      await messageRef.set(firebaseMessageData);

      log('green', `✅ Group message sent: ${messageText.substring(0, 50)}...`);
      log('blue', `   📍 Firebase path: ${groupPath}`);

      // Test group notifications
      const notificationResult = await FirebaseNotificationService.sendGroupMessageNotification(
        groupMessage,
        this.adminUser,
        this.testGroup
      );

      if (notificationResult.success) {
        log('green', `✅ Group notifications sent to ${notificationResult.successfulNotifications}/${notificationResult.totalNotifications} members`);
      } else {
        log('red', `❌ Group notification failed: ${notificationResult.error}`);
      }

      return true;

    } catch (error) {
      log('red', `❌ Group messaging test failed: ${error.message}`);
      return false;
    }
  }

  async testFirebaseListener() {
    try {
      log('magenta', '\n👂 Testing Firebase Real-time Listeners...');

      // Test direct chat listener
      const user = this.testUsers[0];
      const chatPath = [user._id.toString(), this.adminUser._id.toString()].sort().join('_');
      
      log('blue', `   🔗 Listening to chat: ${chatPath}`);
      
      // Set up listener
      const chatRef = this.database.ref(`chats/${chatPath}`);
      const listenerPromise = new Promise((resolve) => {
        const listener = chatRef.on('value', (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const messageCount = Object.keys(data).length;
            log('green', `✅ Real-time update received: ${messageCount} messages in chat`);
            
            // Show latest message
            const messages = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
            const latestMessage = messages[messages.length - 1];
            if (latestMessage) {
              log('cyan', `   📩 Latest: "${latestMessage.text.substring(0, 30)}..." from ${latestMessage.from.username}`);
            }
          }
          
          // Clean up listener and resolve
          chatRef.off('value', listener);
          resolve(true);
        });
      });

      // Wait for listener to trigger
      await listenerPromise;

      // Test group listener
      const groupPath = `group_chats/${this.testGroup._id}`;
      log('blue', `   🔗 Listening to group: ${groupPath}`);
      
      const groupRef = this.database.ref(groupPath);
      const groupListenerPromise = new Promise((resolve) => {
        const listener = groupRef.on('value', (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const messageCount = Object.keys(data).length;
            log('green', `✅ Group real-time update received: ${messageCount} messages`);
          }
          
          // Clean up listener and resolve
          groupRef.off('value', listener);
          resolve(true);
        });
      });

      await groupListenerPromise;

      log('green', '✅ Firebase real-time listeners working correctly');
      return true;

    } catch (error) {
      log('red', `❌ Firebase listener test failed: ${error.message}`);
      return false;
    }
  }

  async testTypingIndicators() {
    try {
      log('magenta', '\n⌨️ Testing Typing Indicators...');

      const user = this.testUsers[0];
      const chatPath = [user._id.toString(), this.adminUser._id.toString()].sort().join('_');
      
      // Set typing status
      const typingRef = this.database.ref(`typing/${chatPath}/${user._id}`);
      await typingRef.set({
        isTyping: true,
        timestamp: Date.now(),
        username: user.phoneNumber
      });

      log('green', `✅ Set typing indicator for user ${user.phoneNumber}`);
      log('blue', `   📍 Firebase path: typing/${chatPath}/${user._id}`);

      // Wait 2 seconds then remove typing
      setTimeout(async () => {
        await typingRef.remove();
        log('green', '✅ Removed typing indicator');
      }, 2000);

      return true;

    } catch (error) {
      log('red', `❌ Typing indicators test failed: ${error.message}`);
      return false;
    }
  }

  async displayConnectionInfo() {
    log('cyan', '\n📊 Real-time Messaging System Information:');
    log('bright', '================================================');
    log('green', `✅ Firebase Project: ${process.env.FIREBASE_PROJECT_ID || 'Not configured'}`);
    log('green', `✅ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
    log('green', `✅ Test Users: ${this.testUsers.length}`);
    log('green', `✅ Test Admin: ${this.adminUser?.username || 'Not created'}`);
    log('green', `✅ Test Group: ${this.testGroup?.name || 'Not created'}`);
    
    log('yellow', '\n🔗 Firebase Paths:');
    if (this.testUsers.length > 0) {
      const user = this.testUsers[0];
      const chatPath = [user._id.toString(), this.adminUser._id.toString()].sort().join('_');
      log('blue', `   💬 Direct Chat: chats/${chatPath}`);
      log('blue', `   ⌨️ Typing: typing/${chatPath}`);
    }
    if (this.testGroup) {
      log('blue', `   👥 Group Chat: group_chats/${this.testGroup._id}`);
    }
    log('blue', `   🔔 Notifications: notifications/{userId}`);
    
    log('bright', '================================================\n');
  }

  async cleanup() {
    try {
      log('yellow', '🧹 Cleaning up test data...');
      
      // Note: In production, you might want to keep test data for further testing
      // Uncomment the following lines if you want to clean up:
      
      // await User.deleteMany({ username: 'testadmin' });
      // await User.deleteMany({ phoneNumber: { $regex: /^\+1555000000/ } });
      // await Group.deleteMany({ name: 'Test Group Chat' });
      // await Message.deleteMany({ 
      //   $or: [
      //     { from: { $in: [...this.testUsers.map(u => u._id), this.adminUser._id] } },
      //     { to: { $in: [...this.testUsers.map(u => u._id), this.adminUser._id] } }
      //   ]
      // });
      // await GroupMessage.deleteMany({ group: this.testGroup?._id });
      
      log('green', '✅ Cleanup completed (test data preserved for inspection)');
      log('yellow', '💡 To remove test data manually, check MongoDB collections: users, messages, groupmessages, groups');

    } catch (error) {
      log('red', `❌ Cleanup failed: ${error.message}`);
    }
  }

  async run() {
    try {
      log('bright', '🚀 Starting Real-time Messaging System Test\n');

      // Initialize
      const initialized = await this.initialize();
      if (!initialized) return false;

      // Create test data
      const usersCreated = await this.createTestUsers();
      if (!usersCreated) return false;

      const groupCreated = await this.createTestGroup();
      if (!groupCreated) return false;

      // Display system info
      await this.displayConnectionInfo();

      // Run tests
      const tests = [
        this.testDirectMessaging.bind(this),
        this.testAdminToUserMessaging.bind(this),
        this.testGroupMessaging.bind(this),
        this.testFirebaseListener.bind(this),
        this.testTypingIndicators.bind(this)
      ];

      let passed = 0;
      for (const test of tests) {
        const result = await test();
        if (result) passed++;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between tests
      }

      // Summary
      log('bright', '\n📋 Test Summary:');
      log('bright', '==================');
      log(passed === tests.length ? 'green' : 'yellow', `✅ Tests Passed: ${passed}/${tests.length}`);
      
      if (passed === tests.length) {
        log('green', '🎉 All real-time messaging tests passed!');
        log('cyan', '💡 Your Firebase real-time messaging system is working correctly.');
        log('cyan', '   You can now test the admin dashboard and mobile app integration.');
      } else {
        log('yellow', '⚠️ Some tests failed. Check Firebase configuration and network connection.');
      }

      // Cleanup
      await this.cleanup();

      return passed === tests.length;

    } catch (error) {
      log('red', `❌ Test execution failed: ${error.message}`);
      return false;
    } finally {
      // Close connections
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        log('blue', '🔌 MongoDB disconnected');
      }
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const test = new RealTimeMessagingTest();
  test.run().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
  });
}

module.exports = RealTimeMessagingTest;
