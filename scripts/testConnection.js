const connectDB = require('../config/database');
const { initializeFirebase } = require('../config/firebase');
const User = require('../models/User');

async function testConnections() {
  console.log('🧪 Testing connections...\n');

  try {
    // Test MongoDB connection
    console.log('📊 Testing MongoDB connection...');
    await connectDB();
    console.log('✅ MongoDB connection successful\n');

    // Test Firebase connection
    console.log('🔥 Testing Firebase connection...');
    await initializeFirebase();
    console.log('✅ Firebase connection successful\n');

    // Test User model
    console.log('👤 Testing User model...');
    const userCount = await User.countDocuments();
    console.log(`✅ User model working - ${userCount} users found\n`);

    // Test admin user
    console.log('👑 Testing admin user...');
    const adminUser = await User.findOne({ role: 'admin' });
    if (adminUser) {
      console.log(`✅ Admin user found: ${adminUser.email}`);
    } else {
      console.log('⚠️  No admin user found');
    }

    console.log('\n🎉 All tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testConnections(); 