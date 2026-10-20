import type { PaymentMethod, Settings, User } from '@/types';

export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Mobile financial service', 'Card'];

export const DEFAULT_CATEGORIES = ['Grocery', 'Beverages', 'Household', 'Personal care'];

export interface Currency {
  code: string;
  symbol: string;
  locale: string;
  label: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'BDT', symbol: '৳', locale: 'en-BD', label: 'BDT · ৳' },
  { code: 'USD', symbol: '$', locale: 'en-US', label: 'USD · $' },
  { code: 'EUR', symbol: '€', locale: 'en-IE', label: 'EUR · €' },
  { code: 'GBP', symbol: '£', locale: 'en-GB', label: 'GBP · £' },
  { code: 'INR', symbol: '₹', locale: 'en-IN', label: 'INR · ₹' },
];

export const EMOJI_PRESETS: { emoji: string; tone: string }[] = [
  { emoji: '🍚', tone: '#fff4dd' },
  { emoji: '🫗', tone: '#fff0d8' },
  { emoji: '🍜', tone: '#ffede5' },
  { emoji: '💧', tone: '#e6f5ff' },
  { emoji: '🧃', tone: '#fff0db' },
  { emoji: '🧺', tone: '#edf2ff' },
  { emoji: '🧼', tone: '#f1eaff' },
  { emoji: '🪥', tone: '#e4f8ed' },
  { emoji: '🥛', tone: '#e6f5ff' },
  { emoji: '🍞', tone: '#fff4dd' },
  { emoji: '🥚', tone: '#fff0d8' },
  { emoji: '🍎', tone: '#ffeaec' },
  { emoji: '🧴', tone: '#f1eaff' },
  { emoji: '🧻', tone: '#edf2ff' },
  { emoji: '☕', tone: '#fff0d8' },
  { emoji: '🍪', tone: '#fff4dd' },
  { emoji: '🥫', tone: '#ffede5' },
  { emoji: '🛒', tone: '#e4f8ed' },
  { emoji: '📦', tone: '#edf2ff' },
];

export const DEFAULT_EMOJI = EMOJI_PRESETS[EMOJI_PRESETS.length - 1];

/** Deprecated legacy mock fixtures. Real authentication is loaded from /api/auth/status. */
export const MOCK_USERS: User[] = [];

export const DEFAULT_SETTINGS: Settings = {
  storeName: 'Nexora POS',
  address: '',
  phone: '',
  email: '',
  taxId: '',
  currencyCode: 'USD',
  taxEnabled: false,
  taxLabel: 'Tax',
  taxRate: 0,
  taxInclusive: false,
  receiptPrefix: 'NX',
  receiptHeader: '',
  receiptFooter: 'Thank you for your business!',
  receiptShowCashier: true,
  receiptShowTaxId: false,
  receiptPaper: '80mm',
  autoPrint: false,
  lowStockThreshold: 5,
  categories: DEFAULT_CATEGORIES,
  autoSync: true,
};

export const ADJUST_REASONS = ['Stock count correction', 'Damaged', 'Expired', 'Lost or stolen', 'Other'];
