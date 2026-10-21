import mongoose, { Schema } from 'mongoose';

const PasswordResetTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index for automatic MongoDB background cleanup after 24 hours
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

const PasswordResetToken =
  mongoose.models.PasswordResetToken ||
  mongoose.model('PasswordResetToken', PasswordResetTokenSchema);

export default PasswordResetToken;
