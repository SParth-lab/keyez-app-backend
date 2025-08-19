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
    required: function() {
      return !this.isAdmin; // Required for regular users only
    },
    unique: true,
    sparse: true,
    match: [/^\+[1-9]\d{1,14}$/, 'Please provide a valid phone number with country code']
  },
  // Firebase UID for phone authentication
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true,
    required: function() {
      return !this.isAdmin; // Required for regular users only
    }
  },
  avatar: {
    type: String,
    trim: true
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  // Single device session management for regular users
  activeSession: {
    deviceFingerprint: {
      type: String,
      required: function() {
        return !this.isAdmin; // Only required for regular users
      }
    },
    sessionToken: {
      type: String,
      unique: true,
      sparse: true
    },
    loginTime: {
      type: Date,
      default: Date.now
    },
    deviceInfo: {
      platform: String,
      version: String,
      model: String,
      appVersion: String
    },
    isActive: {
      type: Boolean,
      default: true
    }
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
  }],
  // Security settings and violations tracking
  securityProfile: {
    screenshotAttempts: {
      type: Number,
      default: 0
    },
    copyAttempts: {
      type: Number,
      default: 0
    },
    securityViolations: [{
      type: {
        type: String,
        enum: ['screenshot_attempt', 'copy_attempt', 'unauthorized_access', 'multiple_login_attempt']
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      deviceInfo: mongoose.Schema.Types.Mixed,
      notifiedAdmin: {
        type: Boolean,
        default: false
      }
    }],
    isBlocked: {
      type: Boolean,
      default: false
    },
    blockReason: String,
    blockedAt: Date
  },
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

// Static method to find by phone number
userSchema.statics.findByPhoneNumber = function(phoneNumber) {
  return this.findOne({ phoneNumber: phoneNumber });
};

// Static method to find by Firebase UID
userSchema.statics.findByFirebaseUid = function(firebaseUid) {
  return this.findOne({ firebaseUid: firebaseUid });
};

// Instance method to create new device session (single device for users)
userSchema.methods.createDeviceSession = function(deviceFingerprint, deviceInfo, sessionToken) {
  if (!this.isAdmin) {
    // For regular users: single device only
    this.activeSession = {
      deviceFingerprint,
      sessionToken,
      loginTime: new Date(),
      deviceInfo,
      isActive: true
    };
  }
  return this.save();
};

// Instance method to validate device session
userSchema.methods.validateDeviceSession = function(deviceFingerprint, sessionToken) {
  if (this.isAdmin) {
    return true; // Admins can have multiple sessions
  }
  
  return this.activeSession &&
         this.activeSession.isActive &&
         this.activeSession.deviceFingerprint === deviceFingerprint &&
         this.activeSession.sessionToken === sessionToken;
};

// Instance method to revoke device session
userSchema.methods.revokeDeviceSession = function() {
  if (this.activeSession) {
    this.activeSession.isActive = false;
  }
  return this.save();
};

// Instance method to record security violation
userSchema.methods.recordSecurityViolation = function(type, deviceInfo = {}) {
  if (!this.securityProfile) {
    this.securityProfile = {
      screenshotAttempts: 0,
      copyAttempts: 0,
      securityViolations: [],
      isBlocked: false
    };
  }
  
  // Increment specific counter
  if (type === 'screenshot_attempt') {
    this.securityProfile.screenshotAttempts += 1;
  } else if (type === 'copy_attempt') {
    this.securityProfile.copyAttempts += 1;
  }
  
  // Add to violations log
  this.securityProfile.securityViolations.push({
    type,
    timestamp: new Date(),
    deviceInfo,
    notifiedAdmin: false
  });
  
  // Auto-block after 3 violations
  if (this.securityProfile.securityViolations.length >= 3) {
    this.securityProfile.isBlocked = true;
    this.securityProfile.blockReason = 'Multiple security violations';
    this.securityProfile.blockedAt = new Date();
  }
  
  return this.save();
};

// Instance method to check if user is blocked
userSchema.methods.isUserBlocked = function() {
  return this.securityProfile && this.securityProfile.isBlocked;
};

// Instance method to unblock user (admin only)
userSchema.methods.unblockUser = function() {
  if (this.securityProfile) {
    this.securityProfile.isBlocked = false;
    this.securityProfile.blockReason = null;
    this.securityProfile.blockedAt = null;
  }
  return this.save();
};

// Instance method to get security violations for admin
userSchema.methods.getSecurityViolations = function() {
  return this.securityProfile ? this.securityProfile.securityViolations : [];
};

// Instance method to add FCM token (updated for single device enforcement)
userSchema.methods.addFcmToken = function(token, deviceType = 'android', deviceId = null) {
  if (!this.isAdmin) {
    // For regular users: only one FCM token (single device)
    this.fcmTokens = [{
      token,
      deviceType,
      deviceId,
      lastUsed: new Date(),
      isActive: true
    }];
  } else {
    // For admins: multiple FCM tokens allowed
    this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
    this.fcmTokens.push({
      token,
      deviceType,
      deviceId,
      lastUsed: new Date(),
      isActive: true
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