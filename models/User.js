const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  // For regular users: phone number is primary identifier
  // For admins: username is primary identifier
  username: {
    type: String,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot be more than 30 characters'],
    required: function() {
      return this.isAdmin; // Only required for admin users
    },
    unique: true,
    sparse: true // Allows multiple null values for non-admin users
  },
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters'],
    required: function() {
      return this.isAdmin; // Only required for admin users
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  phoneNumber: {
    type: String,
    trim: true,
    required: false, // Optional field
    unique: true,
    sparse: true,
    match: [/^\d{10}$/, 'Please provide a valid 10-digit phone number']
  },
  avatar: {
    type: String,
    trim: true
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  // FCM tokens for push notifications (single device for users, multiple for admins)
  fcmTokens: [{
    token: {
      type: String,
      required: true
    },
    deviceType: {
      type: String,
      enum: ['android', 'ios', 'web'],
      default: 'android'
    },
    deviceId: {
      type: String,
      required: false
    },
    lastUsed: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes - removed duplicate index since unique: true already creates an index

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method to get public profile (minimal info)
userSchema.methods.getPublicProfile = function() {
  return {
    username: this.username,
    isAdmin: this.isAdmin,
    id: this._id,
    email: this.email || null,
    phoneNumber: this.phoneNumber || null,
    avatar: this.avatar || null
  };
};

// Static method to find by username
userSchema.statics.findByUsername = function(username) {
  return this.findOne({ username: username.toLowerCase() });
};

// Static method to find by phone number
userSchema.statics.findByPhoneNumber = function(phoneNumber) {
  return this.findOne({ phoneNumber: phoneNumber });
};

// Instance method to add FCM token (updated for single device enforcement)
userSchema.methods.addFcmToken = function(token, deviceType = 'android', deviceId = null) {
  if (!this.isAdmin) {
    // For regular users: only one FCM token (single device)
    this.fcmTokens = [{
      token,
      deviceType,
      deviceId,
    }];
  } else {
    // For admins: multiple FCM tokens allowed
    this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
    this.fcmTokens.push({
      token,
      deviceType,
      deviceId
    });
  }
  
  return this.save();
};

// Instance method to remove FCM token
userSchema.methods.removeFcmToken = function(token) {
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
  return this.save();
};

// Instance method to get active FCM tokens
userSchema.methods.getActiveFcmTokens = function() {
  return this.fcmTokens?.filter(t => t?.isActive)?.map(t => t?.token) || [];
};

// Static method to find users with FCM tokens (for broadcast notifications)
userSchema.statics.findUsersWithTokens = function() {
  return this.find({ 
    'fcmTokens.0': { $exists: true },
    'fcmTokens.isActive': true 
  });
};

module.exports = mongoose.model('User', userSchema); 