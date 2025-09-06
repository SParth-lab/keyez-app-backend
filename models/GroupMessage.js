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
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure either text or attachments is present
groupMessageSchema.pre('validate', function(next) {
  if (!this.text && (!this.attachments || this.attachments.length === 0)) {
    this.invalidate('text', 'Either text or attachments is required');
  }
  next();
});

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
    attachments: this.attachments || [],
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


