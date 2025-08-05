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
    required: [true, 'Message text is required'],
    trim: true,
    maxlength: [1000, 'Message cannot be more than 1000 characters']
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
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
  }).sort({ timestamp: 1 }).populate('from', 'username isAdmin').populate('to', 'username isAdmin');
};

// Static method to find messages for a specific user
messageSchema.statics.findUserMessages = function(userId) {
  return this.find({
    $or: [
      { from: userId },
      { to: userId }
    ]
  }).sort({ timestamp: -1 }).populate('from', 'username isAdmin').populate('to', 'username isAdmin');
};

// Static method to find messages sent by a user
messageSchema.statics.findSentByUser = function(userId) {
  return this.find({ from: userId })
    .sort({ timestamp: -1 })
    .populate('to', 'username isAdmin');
};

// Static method to find messages received by a user
messageSchema.statics.findReceivedByUser = function(userId) {
  return this.find({ to: userId })
    .sort({ timestamp: -1 })
    .populate('from', 'username isAdmin');
};

module.exports = mongoose.model('Message', messageSchema); 