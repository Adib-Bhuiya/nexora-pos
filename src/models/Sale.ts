import { Schema, models, model } from 'mongoose';

const SaleItemSchema = new Schema(
  {
    productId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    cost: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const SaleSchema = new Schema(
  {
    receipt: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    time: {
      type: String,
      required: true,
    },
    cashierId: {
      type: String,
      required: true,
      trim: true,
    },
    cashierName: {
      type: String,
      required: true,
      trim: true,
    },
    method: {
      type: String,
      required: true,
      enum: ['Cash', 'Mobile financial service', 'Card'],
    },
    items: {
      type: [SaleItemSchema],
      required: true,
      validate: [
        (v: unknown[]) => Array.isArray(v) && v.length > 0,
        'Sale must include at least one item.',
      ],
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountType: {
      type: String,
      required: true,
      enum: ['fixed', 'percent'],
    },
    discountValue: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    taxLabel: {
      type: String,
      default: '',
      trim: true,
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxInclusive: {
      type: Boolean,
      default: false,
    },
    tax: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    tendered: {
      type: Number,
      min: 0,
    },
    change: {
      type: Number,
      min: 0,
    },
    syncStatus: {
      type: String,
      default: 'synced',
      enum: ['pending', 'synced'],
    },
  },
  {
    timestamps: true,
  }
);

SaleSchema.index({ time: -1 });
SaleSchema.index({ cashierId: 1, time: -1 });

const Sale = models.Sale || model('Sale', SaleSchema);

export default Sale;

