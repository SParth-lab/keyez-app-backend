const User = require('../models/User');
const connectDB = require('../config/database');

async function createTestUser() {
  try {
    // Connect to database
    await connectDB();
    console.log('📊 Connected to MongoDB\n');
    
    console.log('👤 Creating test user...\n');

    // Check if test user already exists
    const existingUser = await User.findOne({ username: 'testuser' });
    if (existingUser) {
      console.log('✅ Test user already exists');
      return existingUser;
    }

    // Create test user
    const testUser = new User({
      username: 'testuser',
      password: 'password123',
      isAdmin: false
    });

    await testUser.save();
    console.log('✅ Test user created successfully');
    console.log(`   Username: ${testUser.username}`);
    console.log(`   Password: password123`);
    console.log(`   Role: ${testUser.isAdmin ? 'Admin' : 'User'}`);

    return testUser;

  } catch (error) {
    console.error('❌ Failed to create test user:', error);
    throw error;
  }
}

createTestUser()
  .then(() => {
    console.log('✅ Test user creation completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test user creation failed:', error);
    process.exit(1);
  }); 