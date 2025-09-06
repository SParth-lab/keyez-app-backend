const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient is required']
  },
  text: {
    type: String,
    trim: true,
    maxlength: [1000, 'Message cannot be more than 1000 characters']
  },
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'pdf', 'excel', 'document'],
      required: true
    },
    url: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          try {
            new URL(v);
            return true;
          } catch (e) {
            return false;
          }
        },
        message: 'Invalid attachment URL'
      }
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [255, 'File name cannot be more than 255 characters']
    },
    size: {
      type: Number,
      required: true,
      min: [1, 'File size must be at least 1 byte'],
      max: [50 * 1024 * 1024, 'File size cannot exceed 50MB']
    },
    mimeType: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          const allowedTypes = [
            // Images
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            // PDFs
            'application/pdf',
            // Excel files
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            // Additional document types
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ];
          return allowedTypes.includes(v);
        },
        message: 'Unsupported file type'
      }
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  timestamp: {
    type: Date,
    default: Date.now
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Ensure either text or attachments is present
messageSchema.pre('validate', function(next) {
  if (!this.text && (!this.attachments || this.attachments.length === 0)) {
    this.invalidate('text', 'Either text or attachments is required');
  }
  next();
});

// Indexes for efficient querying
messageSchema.index({ from: 1, to: 1 });
messageSchema.index({ to: 1, from: 1 });
messageSchema.index({ timestamp: -1 });

// Virtual for formatted timestamp
messageSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toISOString();
});

// Instance method to get public message data
messageSchema.methods.getPublicData = function() {
  return {
    id: this._id,
    from: this.from,
    to: this.to,
    text: this.text,
    attachments: this.attachments || [],
    timestamp: this.timestamp,
    formattedTimestamp: this.formattedTimestamp
  };
};

// Static method to find conversation between two users
messageSchema.statics.findConversation = function(user1Id, user2Id) {
  return this.find({
    $or: [
      { from: user1Id, to: user2Id },
      { from: user2Id, to: user1Id }
    ]
  }).sort({ timestamp: 1 }).populate('from', 'username isAdmin avatar').populate('to', 'username isAdmin avatar');
};

// Static method to find messages for a specific user
messageSchema.statics.findUserMessages = function(userId) {
  return this.find({
    $or: [
      { from: userId },
      { to: userId }
    ]
  }).sort({ timestamp: -1 }).populate('from', 'username isAdmin avatar').populate('to', 'username isAdmin avatar');
};

// Static method to find messages sent by a user
messageSchema.statics.findSentByUser = function(userId) {
  return this.find({ from: userId })
    .sort({ timestamp: -1 })
    .populate('to', 'username isAdmin avatar');
};

// Static method to find messages received by a user
messageSchema.statics.findReceivedByUser = function(userId) {
  return this.find({ to: userId })
    .sort({ timestamp: -1 })
    .populate('from', 'username isAdmin avatar');
};

// Static method to get unread count for conversations
messageSchema.statics.getUnreadCountsForUser = function(userId) {
  return this.aggregate([
    {
      $match: {
        to: userId, // Messages received by the user
        'readBy.user': { $ne: userId } // Not read by this user
      }
    },
    {
      $group: {
        _id: '$from',
        unreadCount: { $sum: 1 },
        lastMessageTime: { $max: '$timestamp' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'fromUser'
      }
    },
    {
      $unwind: '$fromUser'
    },
    {
      $project: {
        partnerId: '$_id',
        partnerUsername: '$fromUser.username',
        partnerIsAdmin: '$fromUser.isAdmin',
        partnerAvatar: '$fromUser.avatar',
        unreadCount: 1,
        lastMessageTime: 1
      }
    }
  ]);
};

// Static method to mark messages as read
messageSchema.statics.markAsRead = function(fromUserId, toUserId, readByUserId) {
  return this.updateMany(
    {
      from: fromUserId,
      to: toUserId,
      'readBy.user': { $ne: readByUserId }
    },
    {
      $push: {
        readBy: {
          user: readByUserId,
          readAt: new Date()
        }
      }
    }
  );
};

module.exports = mongoose.model('Message', messageSchema); 