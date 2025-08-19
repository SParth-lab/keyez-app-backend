const mongoose = require('mongoose');

const secureMessageSchema = new mongoose.Schema({
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.group; // Either 'to' or 'group' is required
    }
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: function() {
      return !this.to; // Either 'to' or 'group' is required
    }
  },
  // Message content with formatting support
  content: {
    // Plain text version
    text: {
      type: String,
      required: [true, 'Message text is required'],
      maxlength: [2000, 'Message cannot be more than 2000 characters']
    },
    // Formatted text for admin messages
    formatting: {
      bold: [{
        start: Number,
        end: Number
      }],
      italic: [{
        start: Number,
        end: Number
      }],
      highlight: [{
        start: Number,
        end: Number,
        color: {
          type: String,
          default: '#ffff00'
        }
      }],
      underline: [{
        start: Number,
        end: Number
      }]
    },
    // Message type for stock market context
    messageType: {
      type: String,
      enum: ['alert', 'update', 'notification', 'warning', 'info', 'general'],
      default: 'general'
    }
  },
  // Security restrictions
  restrictions: {
    copyable: {
      type: Boolean,
      default: false // Users cannot copy messages by default
    },
    forwardable: {
      type: Boolean,
      default: false // Users cannot forward messages
    },
    screenshotAllowed: {
      type: Boolean,
      default: false // Screenshots not allowed by default
    },
    expiresAt: {
      type: Date,
      default: null // Message expiration (optional)
    }
  },
  // Message status and tracking
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  readAt: {
    type: Date,
    default: null
  },
  // Security violation tracking
  securityEvents: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    eventType: {
      type: String,
      enum: ['screenshot_attempt', 'copy_attempt', 'forward_attempt', 'unauthorized_access']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    deviceInfo: mongoose.Schema.Types.Mixed,
    adminNotified: {
      type: Boolean,
      default: false
    }
  }],
  // Admin-only message metadata
  adminMetadata: {
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal'
    },
    category: {
      type: String,
      enum: ['market_update', 'trading_alert', 'compliance', 'announcement', 'personal'],
      default: 'personal'
    },
    isSystemMessage: {
      type: Boolean,
      default: false
    },
    scheduleFor: {
      type: Date,
      default: null // Scheduled message delivery
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
secureMessageSchema.index({ from: 1, to: 1, createdAt: -1 });
secureMessageSchema.index({ group: 1, createdAt: -1 });
secureMessageSchema.index({ 'restrictions.expiresAt': 1 });
secureMessageSchema.index({ status: 1 });

// Virtual for message recipient(s)
secureMessageSchema.virtual('recipients').get(function() {
  if (this.group) {
    return { type: 'group', id: this.group };
  } else {
    return { type: 'user', id: this.to };
  }
});

// Instance method to get formatted text for display
secureMessageSchema.methods.getFormattedText = function() {
  if (!this.content.formatting || Object.keys(this.content.formatting).length === 0) {
    return this.content.text;
  }
  
  // Return both plain text and formatting instructions
  return {
    text: this.content.text,
    formatting: this.content.formatting
  };
};

// Instance method to check if message has expired
secureMessageSchema.methods.isExpired = function() {
  return this.restrictions.expiresAt && new Date() > this.restrictions.expiresAt;
};

// Instance method to mark as read
secureMessageSchema.methods.markAsRead = function() {
  this.status = 'read';
  this.readAt = new Date();
  return this.save();
};

// Instance method to mark as delivered
secureMessageSchema.methods.markAsDelivered = function() {
  if (this.status === 'sent') {
    this.status = 'delivered';
    this.deliveredAt = new Date();
    return this.save();
  }
  return this;
};

// Instance method to record security violation
secureMessageSchema.methods.recordSecurityViolation = function(userId, eventType, deviceInfo = {}) {
  this.securityEvents.push({
    userId,
    eventType,
    timestamp: new Date(),
    deviceInfo,
    adminNotified: false
  });
  return this.save();
};

// Instance method to get public message data (for users)
secureMessageSchema.methods.getPublicData = function() {
  return {
    id: this._id,
    from: this.from,
    content: this.getFormattedText(),
    messageType: this.content.messageType,
    createdAt: this.createdAt,
    status: this.status,
    readAt: this.readAt,
    restrictions: {
      copyable: this.restrictions.copyable,
      forwardable: this.restrictions.forwardable,
      screenshotAllowed: this.restrictions.screenshotAllowed
    },
    isExpired: this.isExpired()
  };
};

// Instance method to get admin message data (for admins)
secureMessageSchema.methods.getAdminData = function() {
  return {
    id: this._id,
    from: this.from,
    to: this.to,
    group: this.group,
    content: this.content,
    restrictions: this.restrictions,
    status: this.status,
    deliveredAt: this.deliveredAt,
    readAt: this.readAt,
    securityEvents: this.securityEvents,
    adminMetadata: this.adminMetadata,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Static method to find messages by user conversation
secureMessageSchema.statics.findConversation = function(userId1, userId2, options = {}) {
  const { page = 1, limit = 50 } = options;
  const skip = (page - 1) * limit;
  
  return this.find({
    $or: [
      { from: userId1, to: userId2 },
      { from: userId2, to: userId1 }
    ]
  })
  .populate('from', 'username phoneNumber isAdmin avatar')
  .populate('to', 'username phoneNumber isAdmin avatar')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to find group messages
secureMessageSchema.statics.findGroupMessages = function(groupId, options = {}) {
  const { page = 1, limit = 50 } = options;
  const skip = (page - 1) * limit;
  
  return this.find({ group: groupId })
    .populate('from', 'username phoneNumber isAdmin avatar')
    .populate('group', 'name description')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to find messages with security violations
secureMessageSchema.statics.findMessagesWithViolations = function() {
  return this.find({
    'securityEvents.0': { $exists: true }
  })
  .populate('from', 'username phoneNumber isAdmin')
  .populate('to', 'username phoneNumber isAdmin')
  .populate('securityEvents.userId', 'username phoneNumber')
  .sort({ 'securityEvents.timestamp': -1 });
};

// Static method to clean up expired messages
secureMessageSchema.statics.cleanupExpiredMessages = function() {
  return this.deleteMany({
    'restrictions.expiresAt': { $lt: new Date() }
  });
};

module.exports = mongoose.model('SecureMessage', secureMessageSchema);
