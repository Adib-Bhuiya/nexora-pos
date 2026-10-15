import { Schema, models, model } from 'mongoose';
import { DEFAULT_CATEGORIES } from '@/config/constants';

const SettingsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'app',
    },
    storeName: {
      type: String,
      required: true,
      trim: true,
      default: 'Nexora POS',
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
    },
    taxId: {
      type: String,
      default: '',
      trim: true,
    },
    currencyCode: {
      type: String,
      default: 'USD',
      trim: true,
    },
    taxEnabled: {
      type: Boolean,
      default: false,
    },
    taxLabel: {
      type: String,
      default: 'Tax',
      trim: true,
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    taxInclusive: {
      type: Boolean,
      default: false,
    },
    receiptPrefix: {
      type: String,
      default: 'NX',
      trim: true,
    },
    receiptHeader: {
      type: String,
      default: '',
      trim: true,
    },
    receiptFooter: {
      type: String,
      default: 'Thank you for your business!',
      trim: true,
    },
    receiptShowCashier: {
      type: Boolean,
      default: true,
    },
    receiptShowTaxId: {
      type: Boolean,
      default: false,
    },
    receiptPaper: {
      type: String,
      default: '80mm',
      enum: ['58mm', '80mm'],
    },
    autoPrint: {
      type: Boolean,
      default: false,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 0,
    },
    categories: {
      type: [String],
      default: DEFAULT_CATEGORIES,
    },
    autoSync: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Settings = models.Settings || model('Settings', SettingsSchema);

export default Settings;

