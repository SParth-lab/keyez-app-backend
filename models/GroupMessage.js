const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: [true, 'Group is required'],
    },
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
    },
    text: {
      type: String,
      trim: true,
      maxlength: [1000, 'Message cannot be more than 1000 characters'],
    },
    imageUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          if (!v) return true;
          try {
            new URL(v);
            return true;
          } catch (e) {
            return false;
          }
        },
        message: 'Invalid image URL'
      }
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

groupMessageSchema.index({ group: 1, timestamp: 1 });
groupMessageSchema.index({ from: 1 });

groupMessageSchema.virtual('formattedTimestamp').get(function () {
  return this.timestamp.toISOString();
});

groupMessageSchema.methods.getPublicData = function () {
  return {
    id: this._id,
    group: this.group,
    from: this.from,
    text: this.text,
    imageUrl: this.imageUrl || null,
    timestamp: this.timestamp,
    formattedTimestamp: this.formattedTimestamp,
  };
};

groupMessageSchema.statics.findByGroup = function (groupId) {
  return this.find({ group: groupId })
    .sort({ timestamp: 1 })
    .populate('from', 'username isAdmin avatar');
};

module.exports = mongoose.model('GroupMessage', groupMessageSchema);


