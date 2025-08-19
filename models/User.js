const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot be more than 30 characters']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
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
    trim: true
  },
  avatar: {
    type: String,
    trim: true
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  // FCM tokens for push notifications (array to support multiple devices)
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
  }],
  // Notification preferences
  notificationSettings: {
    pushEnabled: {
      type: Boolean,
      default: function() {
        // Admins don't get push notifications (they use web interface)
        return !this.isAdmin;
      }
    },
    messageNotifications: {
      type: Boolean,
      default: true
    },
    systemNotifications: {
      type: Boolean,
      default: true
    },
    announcementNotifications: {
      type: Boolean,
      default: true
    }
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  isOnline: {
    type: Boolean,
    default: false
  }
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

// Instance method to add FCM token
userSchema.methods.addFcmToken = function(token, deviceType = 'android', deviceId = null) {
  // Remove existing token if it exists
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
  
  // Add new token
  this.fcmTokens.push({
    token,
    deviceType,
    deviceId,
    lastUsed: new Date(),
    isActive: true
  });
  
  return this.save();
};

// Instance method to remove FCM token
userSchema.methods.removeFcmToken = function(token) {
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
  return this.save();
};

// Instance method to get active FCM tokens
userSchema.methods.getActiveFcmTokens = function() {
  return this.fcmTokens
    .filter(t => t.isActive)
    .map(t => t.token);
};

// Instance method to update last seen
userSchema.methods.updateLastSeen = function() {
  this.lastSeen = new Date();
  return this.save();
};

// Instance method to set online status
userSchema.methods.setOnlineStatus = function(isOnline) {
  this.isOnline = isOnline;
  if (isOnline) {
    this.lastSeen = new Date();
  }
  return this.save();
};

// Instance method to update notification settings
userSchema.methods.updateNotificationSettings = function(settings) {
  this.notificationSettings = { ...this.notificationSettings, ...settings };
  return this.save();
};

// Static method to find users with FCM tokens (for broadcast notifications)
userSchema.statics.findUsersWithTokens = function() {
  return this.find({ 
    'fcmTokens.0': { $exists: true },
    'fcmTokens.isActive': true 
  });
};

module.exports = mongoose.model('User', userSchema); 