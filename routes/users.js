const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Middleware to verify admin role
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get all users (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search, status } = req.query;
    
    const query = {};
    
    if (role) {
      query.isAdmin = role === 'admin';
    } else {
      query.isAdmin = false
    }
    if (status === 'active') {
      query.isDeleted = false
    } else if (status === 'deleted') {
      query.isDeleted = true
    } else {
      delete query.isDeleted
    }
    if (search) {
      query.username = { $regex: search, $options: 'i' };
    }
    const users = await User.find(query)
      .select('-password')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

      console.log(query)

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user by ID (admin only)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false }).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { username, email, phoneNumber, avatar, isDeleted } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update allowed fields
    if (username) user.username = username;
    if (email !== undefined) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (avatar !== undefined) user.avatar = avatar;
    if (typeof isDeleted === 'boolean') user.isDeleted = isDeleted;

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting the last admin
    if (user.isAdmin) {
      const adminCount = await User.countDocuments({ isAdmin: true });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin user' });
      }
    }

    // Soft delete instead of hard delete
    user.isDeleted = true;
    await user.save();

    res.json({ message: 'User soft-deleted successfully' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get admin users (no authentication required)
router.get('/admins/public', async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    const query = { isAdmin: true };
    
    if (search) {
      query.username = { $regex: search, $options: 'i' };
    }

    query.isDeleted = false;
    const adminUsers = await User.find(query)
      .select('-password')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      adminUsers,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      message: 'Admin users retrieved successfully'
    });

  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch admin users' });
  }
});

// Get admin users count (no authentication required)
router.get('/admins/public/count', async (req, res) => {
  try {
    const adminCount = await User.countDocuments({ isAdmin: true, isDeleted: false });
    
    res.json({
      adminCount,
      message: 'Admin count retrieved successfully'
    });

  } catch (error) {
    console.error('Get admin count error:', error);
    res.status(500).json({ error: 'Failed to fetch admin count' });
  }
});

// Get user statistics (admin only)
router.get('/stats/overview', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const adminUsers = await User.countDocuments({ isAdmin: true });
    const regularUsers = await User.countDocuments({ isAdmin: false });

    // Users created in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({
      totalUsers,
      adminUsers,
      regularUsers,
      recentUsers
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});


// Restore user (admin only)
router.post('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isDeleted = false;
    await user.save();

    res.json({ message: 'User restored successfully', user: user.getPublicProfile() });
  } catch (error) {
    console.error('Restore user error:', error);
    res.status(500).json({ error: 'Failed to restore user' });
  }
});

// Generate random password utility
const generateRandomPassword = (length = 8) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// Create user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, email, phoneNumber, password, isAdmin = false } = req.body;

    // Validate that either username or phoneNumber is provided
    if (!username && !phoneNumber) {
      return res.status(400).json({ error: 'Either username or phone number is required' });
    }

    // Generate password if not provided
    let userPassword = password;
    let generatedPassword = null;
    if (!userPassword) {
      userPassword = generateRandomPassword(8);
      generatedPassword = userPassword; // Store for response
    }

    // Validate password length
    if (userPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Additional validation for email format if provided
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    // Additional validation for phone number format if provided
    if (phoneNumber && !/^\d{10}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Please provide a valid 10-digit phone number' });
    }

    // Check for existing users with same username or phone number
    if (username) {
      const existingUserByUsername = await User.findByUsername(username);
      if (existingUserByUsername) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    if (phoneNumber) {
      const existingUserByPhone = await User.findByPhoneNumber(phoneNumber);
      if (existingUserByPhone) {
        return res.status(400).json({ error: 'Phone number already exists' });
      }
    }

    // Check for existing email if provided
    if (email) {
      const existingUserByEmail = await User.findOne({ email: email.toLowerCase(), isDeleted: false });
      if (existingUserByEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    // Create new user
    const newUser = new User({
      username: username || undefined,
      email: email || undefined,
      phoneNumber: phoneNumber || undefined,
      password: userPassword,
      isAdmin: Boolean(isAdmin)
    });

    await newUser.save();

    // Prepare response
    const responseData = {
      message: 'User created successfully',
      user: newUser.getPublicProfile()
    };

    // Include generated password in response if it was auto-generated
    if (generatedPassword) {
      responseData.generatedPassword = generatedPassword;
    }

    res.status(201).json(responseData);

  } catch (error) {
    console.error('Create user error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || 'field';
      return res.status(400).json({ error: `${field} already exists` });
    }
    
    res.status(500).json({ error: 'Failed to create user' });
  }
});

module.exports = router;