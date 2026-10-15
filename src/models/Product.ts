
import { Schema, models, model } from 'mongoose';

const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    barcode: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
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
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },

    tone: {
      type: String,
      default: 'blue',
    },
  },
  {
    timestamps: true,
  }
);

ProductSchema.index(
  { barcode: 1 },
  {
    unique: true,
    partialFilterExpression: { barcode: { $gt: '' } },
  }
);

const Product =
  models.Product || model('Product', ProductSchema);

export default Product;
