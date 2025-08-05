const mongoose = require('mongoose');
const connectDB = require('../config/database');

async function resetDatabase() {
  try {
    // Connect to database
    await connectDB();
    console.log('📊 Connected to MongoDB\n');
    
    console.log('🧹 Resetting database...\n');

    // Drop the users collection to remove old schema
    await mongoose.connection.db.dropCollection('users');
    console.log('✅ Dropped users collection');

    // Create new collection with correct schema
    const User = require('../models/User');
    console.log('✅ Created new users collection with updated schema');

    console.log('✅ Database reset completed successfully');

  } catch (error) {
    console.error('❌ Database reset failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('📊 Database connection closed');
  }
}

resetDatabase(); 