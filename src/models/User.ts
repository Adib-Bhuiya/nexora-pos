import { Schema, models, model } from 'mongoose';

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    passwordHash: {
      type: String,
      default: '',
    },
    pinHash: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['owner', 'cashier'],
      required: true,
      default: 'cashier',
    },
    isOwner: {
      type: Boolean,
      default: false,
    },
    initials: {
      type: String,
      required: true,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    failedPinAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    pinLockedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index(
  { isOwner: 1 },
  {
    unique: true,
    partialFilterExpression: { isOwner: true },
  }
);

UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string', $gt: '' } },
  }
);

const User = models.User || model('User', UserSchema);

export default User;
