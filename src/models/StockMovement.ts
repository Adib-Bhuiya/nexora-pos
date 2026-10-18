import mongoose, { Schema } from 'mongoose';

const StockMovementSchema = new Schema(
  {
    seq: {
      type: Number,
      default: 0,
    },
    productId: {
      type: String,
      required: true,
      trim: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['initial', 'sale', 'restock', 'adjustment'],
    },
    change: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    reference: {
      type: String,
      default: '',
      trim: true,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
    },
    time: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

StockMovementSchema.index({ time: -1 });
StockMovementSchema.index({ productId: 1, time: -1 });
StockMovementSchema.index({ seq: -1 });

const StockMovement =
  mongoose.models.StockMovement ||
  mongoose.model('StockMovement', StockMovementSchema);

export default StockMovement;

