const User = require('../models/User');
const Message = require('../models/Message');
const connectDB = require('../config/database');

async function testMessaging() {
  try {
    // Connect to database
    await connectDB();
    console.log('📊 Connected to MongoDB\n');
    
    console.log('🧪 Testing messaging functionality...\n');

    // Get admin and test user
    const admin = await User.findOne({ username: 'admin' });
    const testUser = await User.findOne({ username: 'testuser' });

    if (!admin || !testUser) {
      console.log('❌ Admin or test user not found. Please ensure users exist.');
      return;
    }

    console.log('✅ Found users:');
    console.log(`   Admin: ${admin.username} (${admin.isAdmin ? 'Admin' : 'User'})`);
    console.log(`   Test User: ${testUser.username} (${testUser.isAdmin ? 'Admin' : 'User'})`);

    // Test 1: User sending message to admin (should work)
    console.log('\n📤 Test 1: User sending message to admin...');
    const userToAdminMessage = new Message({
      from: testUser._id,
      to: admin._id,
      text: 'Hello admin, I need help!'
    });
    await userToAdminMessage.save();
    console.log('✅ User can send message to admin');

    // Test 2: Admin sending message to user (should work)
    console.log('\n📤 Test 2: Admin sending message to user...');
    const adminToUserMessage = new Message({
      from: admin._id,
      to: testUser._id,
      text: 'Hello user, I can help you!'
    });
    await adminToUserMessage.save();
    console.log('✅ Admin can send message to user');

    // Test 3: Get conversation between user and admin
    console.log('\n📥 Test 3: Getting conversation history...');
    const conversation = await Message.findConversation(testUser._id, admin._id);
    console.log(`✅ Found ${conversation.length} messages in conversation`);

    // Test 4: Get user's conversations
    console.log('\n📋 Test 4: Getting user conversations...');
    const userMessages = await Message.findUserMessages(testUser._id);
    console.log(`✅ User has ${userMessages.length} total messages`);

    // Test 5: Get admin's conversations
    console.log('\n📋 Test 5: Getting admin conversations...');
    const adminMessages = await Message.findUserMessages(admin._id);
    console.log(`✅ Admin has ${adminMessages.length} total messages`);

    console.log('\n🎉 All messaging tests passed!');
    console.log('\n📊 Message Statistics:');
    console.log(`   Total messages in database: ${await Message.countDocuments()}`);
    console.log(`   Messages sent by user: ${await Message.countDocuments({ from: testUser._id })}`);
    console.log(`   Messages sent by admin: ${await Message.countDocuments({ from: admin._id })}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await require('mongoose').connection.close();
    console.log('📊 Database connection closed');
  }
}

testMessaging(); 