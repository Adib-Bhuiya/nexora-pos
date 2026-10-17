import { Schema, models, model } from 'mongoose';

const RateLimitSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    count: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  }
);

const RateLimit = models.RateLimit || model('RateLimit', RateLimitSchema);

export default RateLimit;
