const mongoose = require('mongoose');
const firebaseUnreadService = require('../services/firebaseUnreadService');
const { initializeFirebase } = require('../config/firebase');
require('dotenv').config();

// Test Firebase unread count functionality
async function testFirebaseUnreadCounts() {
  console.log('🧪 Testing Firebase Unread Count Service...\n');

  try {
    // Initialize Firebase
    await initializeFirebase();
    console.log('✅ Firebase initialized successfully\n');

    if (!firebaseUnreadService.isAvailable()) {
      console.log('❌ Firebase Realtime Database not available');
      return;
    }

    // Test user IDs (replace with actual user IDs from your database)
    const testUserId1 = '507f1f77bcf86cd799439011'; // Example MongoDB ObjectId
    const testUserId2 = '507f1f77bcf86cd799439012'; // Example MongoDB ObjectId
    const testGroupId = '507f1f77bcf86cd799439013'; // Example Group ID

    console.log('📊 Test Parameters:');
    console.log(`User 1 ID: ${testUserId1}`);
    console.log(`User 2 ID: ${testUserId2}`);
    console.log(`Group ID: ${testGroupId}\n`);

    // Test 1: Initial unread counts (should be 0)
    console.log('🔍 Test 1: Getting initial unread counts...');
    let unreadCounts = await firebaseUnreadService.getUserUnreadCounts(testUserId1);
    console.log('Initial unread counts for User 1:', JSON.stringify(unreadCounts, null, 2));

    // Test 2: Increment direct message unread count
    console.log('\n📈 Test 2: Incrementing direct message unread count...');
    await firebaseUnreadService.incrementDirectUnreadCount(testUserId1, testUserId2);
    await firebaseUnreadService.incrementDirectUnreadCount(testUserId1, testUserId2);
    
    unreadCounts = await firebaseUnreadService.getUserUnreadCounts(testUserId1);
    console.log('After 2 increments - User 1 unread counts:', JSON.stringify(unreadCounts, null, 2));

    const directCount = await firebaseUnreadService.getDirectUnreadCount(testUserId1, testUserId2);
    console.log(`Direct unread count from User 2 to User 1: ${directCount}`);

    // Test 3: Increment group message unread count
    console.log('\n👥 Test 3: Incrementing group message unread count...');
    const memberIds = [testUserId1, testUserId2];
    await firebaseUnreadService.incrementGroupUnreadCount(testGroupId, testUserId2, memberIds);
    
    unreadCounts = await firebaseUnreadService.getUserUnreadCounts(testUserId1);
    console.log('After group message - User 1 unread counts:', JSON.stringify(unreadCounts, null, 2));

    const groupCount = await firebaseUnreadService.getGroupUnreadCount(testUserId1, testGroupId);
    console.log(`Group unread count for User 1: ${groupCount}`);

    // Test 4: Get total unread count
    console.log('\n📊 Test 4: Getting total unread count...');
    const totalCount = await firebaseUnreadService.getTotalUnreadCount(testUserId1);
    console.log(`Total unread count for User 1: ${totalCount}`);

    // Test 5: Clear direct unread count
    console.log('\n🧹 Test 5: Clearing direct unread count...');
    await firebaseUnreadService.clearDirectUnreadCount(testUserId1, testUserId2);
    
    unreadCounts = await firebaseUnreadService.getUserUnreadCounts(testUserId1);
    console.log('After clearing direct unread - User 1 unread counts:', JSON.stringify(unreadCounts, null, 2));

    // Test 6: Clear group unread count
    console.log('\n🧹 Test 6: Clearing group unread count...');
    await firebaseUnreadService.clearGroupUnreadCount(testUserId1, testGroupId);
    
    unreadCounts = await firebaseUnreadService.getUserUnreadCounts(testUserId1);
    console.log('After clearing group unread - User 1 unread counts:', JSON.stringify(unreadCounts, null, 2));

    // Test 7: Test real-time listener
    console.log('\n🎧 Test 7: Testing real-time listener...');
    console.log('Setting up listener for User 1 unread counts...');
    
    const unsubscribe = firebaseUnreadService.onUnreadCountsChange(testUserId1, (updatedCounts) => {
      console.log('📡 Real-time update received:', JSON.stringify(updatedCounts, null, 2));
    });

    // Make some changes to trigger the listener
    console.log('Making changes to trigger real-time updates...');
    await firebaseUnreadService.incrementDirectUnreadCount(testUserId1, testUserId2);
    
    // Wait a bit for the real-time update
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await firebaseUnreadService.clearDirectUnreadCount(testUserId1, testUserId2);
    
    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Unsubscribe from listener
    unsubscribe();
    console.log('✅ Unsubscribed from real-time listener');

    // Test 8: Clear all unread counts
    console.log('\n🧹 Test 8: Clearing all unread counts...');
    await firebaseUnreadService.clearAllUnreadCounts(testUserId1);
    
    unreadCounts = await firebaseUnreadService.getUserUnreadCounts(testUserId1);
    console.log('After clearing all - User 1 unread counts:', JSON.stringify(unreadCounts, null, 2));

    console.log('\n✅ All Firebase unread count tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

// Run the test
if (require.main === module) {
  testFirebaseUnreadCounts();
}

module.exports = testFirebaseUnreadCounts;
