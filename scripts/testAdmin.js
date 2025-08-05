const User = require('../models/User');
const bcrypt = require('bcrypt');
const connectDB = require('../config/database');

async function testAdmin() {
  try {
    // Connect to database
    await connectDB();
    console.log('📊 Connected to MongoDB\n');
    
    console.log('🔍 Testing admin user...\n');

    // Find admin user
    const admin = await User.findOne({ email: 'admin@example.com' });
    
    if (!admin) {
      console.log('❌ Admin user not found');
      return;
    }

    console.log('✅ Admin user found:');
    console.log(`   Name: ${admin.name}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Is Active: ${admin.isActive}`);

    // Test password
    const testPassword = 'admin123';
    const isPasswordValid = await admin.comparePassword(testPassword);
    
    console.log(`\n🔐 Password test: ${isPasswordValid ? '✅ Valid' : '❌ Invalid'}`);

    if (isPasswordValid) {
      console.log('✅ Admin login should work correctly');
    } else {
      console.log('❌ Admin login will fail - password mismatch');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAdmin(); 