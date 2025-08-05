const User = require('../models/User');
const connectDB = require('../config/database');

const seedAdmin = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      username: process.env.ADMIN_USERNAME || 'admin' 
    });

    if (existingAdmin) {
      console.log('Admin user already exists');
      return existingAdmin;
    }

    // Create default admin user
    const adminData = {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      isAdmin: true
    };

    const admin = new User(adminData);
    await admin.save();

    console.log('✅ Default admin user created successfully');
    console.log(`👤 Username: ${admin.username}`);
    console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    console.log('⚠️  Please change the default password after first login!');

    return admin;

  } catch (error) {
    console.error('❌ Failed to seed admin user:', error);
    throw error;
  }
};

// If running directly
if (require.main === module) {
  seedAdmin()
    .then(() => {
      console.log('✅ Admin seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Admin seeding failed:', error);
      process.exit(1);
    });
}

module.exports = seedAdmin; 