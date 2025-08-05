const User = require('../models/User');
const connectDB = require('../config/database');

async function testRegistration() {
  try {
    // Connect to database
    await connectDB();
    console.log('📊 Connected to MongoDB\n');
    
    console.log('🧪 Testing user registration...\n');

    // Test data
    const testUser = {
      username: 'testuser',
      password: 'password123'
    };

    console.log('Creating user with data:', { username: testUser.username, password: '[HIDDEN]' });

    // Check if user already exists
    const existingUser = await User.findByUsername(testUser.username);
    if (existingUser) {
      console.log('❌ User already exists');
      return;
    }

    // Create new user
    const user = new User(testUser);
    console.log('User object created:', user);

    await user.save();
    console.log('✅ User saved successfully');

    console.log('User details:', user.getPublicProfile());

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error details:', error.message);
    if (error.errors) {
      console.error('Validation errors:', error.errors);
    }
  }
}

testRegistration(); 