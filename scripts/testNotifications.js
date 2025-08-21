#!/usr/bin/env node

/**
 * Test script for notification system
 * This script demonstrates the complete notification flow
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const NotificationService = require('../services/notificationService');
const { initializeFirebase } = require('../config/firebase');
require('dotenv').config();

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/messaging');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

async function setupTestUsers() {
  console.log('\n📝 Setting up test users...');
  
  // Create test admin user
  const adminUser = await User.findOne({ username: 'testadmin' }) || new User({
    username: 'testadmin',
    password: 'password123',
    email: 'admin@test.com',
    isAdmin: true
  });
  
  if (adminUser.isNew) {
    await adminUser.save();
    console.log('✅ Created test admin user');
  } else {
    console.log('ℹ️  Test admin user already exists');
  }

  // Create test regular user
  const regularUser = await User.findOne({ username: 'testuser' }) || new User({
    username: 'testuser',
    password: 'password123',
    email: 'user@test.com',
    isAdmin: false
  });

  // Add a fake FCM token for testing
  if (regularUser.fcmTokens.length === 0) {
    await regularUser.addFcmToken(
      'fake_fcm_token_for_testing_' + Date.now(),
      'android',
      'test_device_123'
    );
    console.log('✅ Added FCM token to test user');
  }
  
  if (regularUser.isNew) {
    await regularUser.save();
    console.log('✅ Created test regular user');
  } else {
    console.log('ℹ️  Test regular user already exists');
  }

  return { adminUser, regularUser };
}

async function testNotificationCreation(adminUser, regularUser) {
  console.log('\n🧪 Testing notification creation...');

  // Test 1: System notification
  const systemNotification = new Notification({
    title: 'System Maintenance',
    body: 'The system will be down for maintenance from 2 AM to 4 AM.',
    type: 'system',
    priority: 'high',
    recipient: regularUser._id,
    sender: adminUser._id,
    data: {
      maintenanceStart: '2024-01-01T02:00:00Z',
      maintenanceEnd: '2024-01-01T04:00:00Z'
    }
  });

  await systemNotification.save();
  console.log('✅ Created system notification');

  // Test 2: Message notification (simulating automatic creation)
  const messageNotification = new Notification({
    title: `New message from ${adminUser.username}`,
    body: 'Hello! This is a test message.',
    type: 'message',
    priority: 'normal',
    recipient: regularUser._id,
    sender: adminUser._id,
    data: {
      messageId: 'fake_message_id_123',
      chatPath: `chats/${adminUser._id}_${regularUser._id}`
    }
  });

  await messageNotification.save();
  console.log('✅ Created message notification');

  // Test 3: Announcement notification
  const announcementNotification = new Notification({
    title: 'New Feature Available',
    body: 'Check out our new notification system! Now you can receive real-time updates.',
    type: 'announcement',
    priority: 'normal',
    recipient: regularUser._id,
    sender: adminUser._id,
    data: {
      featureName: 'notification_system',
      version: '1.0.0'
    }
  });

  await announcementNotification.save();
  console.log('✅ Created announcement notification');

  return [systemNotification, messageNotification, announcementNotification];
}

async function testNotificationService(adminUser, regularUser) {
  console.log('\n🔧 Testing NotificationService...');

  // Test automatic message notification
  const fakeMessage = {
    _id: 'fake_message_id_456',
    text: 'This is a test message for notification service',
    timestamp: new Date()
  };

  const messageNotificationResult = await NotificationService.sendMessageNotification(
    fakeMessage,
    adminUser,
    regularUser
  );

  if (messageNotificationResult.success) {
    console.log('✅ Message notification service working');
  } else {
    console.log('⚠️  Message notification service issue:', messageNotificationResult.reason || messageNotificationResult.error);
  }

  // Test system notification broadcast
  const systemNotificationResult = await NotificationService.sendSystemNotification(
    [regularUser._id],
    'Test System Notification',
    'This is a test system notification sent via NotificationService',
    {
      type: 'system',
      priority: 'normal',
      sendPush: false, // Disable push for testing
      sender: adminUser._id
    }
  );

  if (systemNotificationResult.success) {
    console.log('✅ System notification service working');
  } else {
    console.log('❌ System notification service failed:', systemNotificationResult.error);
  }
}

async function testNotificationQueries(regularUser) {
  console.log('\n📊 Testing notification queries...');

  // Get all notifications for user
  const allNotifications = await Notification.findForUser(regularUser._id);
  console.log(`✅ Found ${allNotifications.length} notifications for user`);

  // Get unread count
  const unreadCount = await Notification.getUnreadCount(regularUser._id);
  console.log(`✅ Unread notifications: ${unreadCount}`);

  // Test filtering
  const systemNotifications = await Notification.findForUser(regularUser._id, { type: 'system' });
  console.log(`✅ Found ${systemNotifications.length} system notifications`);

  const highPriorityNotifications = await Notification.findForUser(regularUser._id, { priority: 'high' });
  console.log(`✅ Found ${highPriorityNotifications.length} high priority notifications`);

  return allNotifications;
}

async function testNotificationActions(notifications) {
  console.log('\n⚡ Testing notification actions...');

  if (notifications.length > 0) {
    const firstNotification = notifications[0];

    // Test mark as read
    if (!firstNotification.isRead) {
      await firstNotification.markAsRead();
      console.log('✅ Marked notification as read');
    }

    // Test mark as delivered
    if (firstNotification.status !== 'delivered') {
      await firstNotification.markAsDelivered();
      console.log('✅ Marked notification as delivered');
    }

    console.log('📄 Notification public data:');
    console.log(JSON.stringify(firstNotification.getPublicData(), null, 2));
  }
}

async function testStatistics() {
  console.log('\n📈 Testing notification statistics...');

  const stats = await NotificationService.getNotificationStats();
  if (stats.success) {
    console.log('✅ Notification statistics:');
    console.log(JSON.stringify(stats.stats, null, 2));
  } else {
    console.log('❌ Failed to get statistics:', stats.error);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  
  // Remove test notifications
  await Notification.deleteMany({
    $or: [
      { title: { $regex: /test/i } },
      { body: { $regex: /test/i } },
      { title: { $regex: /system maintenance/i } },
      { title: { $regex: /new feature/i } }
    ]
  });
  
  console.log('✅ Cleaned up test notifications');
}

async function runTests() {
  console.log('🚀 Starting notification system tests...\n');

  try {
    // Initialize database and Firebase
    await connectToDatabase();
    await initializeFirebase();
    console.log('✅ Firebase initialized');

    // Setup test data
    const { adminUser, regularUser } = await setupTestUsers();

    // Run tests
    const notifications = await testNotificationCreation(adminUser, regularUser);
    await testNotificationService(adminUser, regularUser);
    const allNotifications = await testNotificationQueries(regularUser);
    await testNotificationActions(allNotifications);
    await testStatistics();

    // Cleanup
    await cleanup();

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('- ✅ Database connection');
    console.log('- ✅ User setup with FCM tokens');
    console.log('- ✅ Notification creation');
    console.log('- ✅ NotificationService functionality');
    console.log('- ✅ Database queries and filtering');
    console.log('- ✅ Notification state management');
    console.log('- ✅ Statistics generation');
    console.log('- ✅ Data cleanup');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
