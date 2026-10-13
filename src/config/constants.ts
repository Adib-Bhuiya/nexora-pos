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

/** Demo identities. Role switching is a UI demonstration only — it is not security. */
export const MOCK_USERS: User[] = [
  { id: 'u-admin', name: 'Adib', role: 'admin', initials: 'AD' },
  { id: 'u-cash-1', name: 'Rafi Hasan', role: 'cashier', initials: 'RH' },
  { id: 'u-cash-2', name: 'Nusrat Jahan', role: 'cashier', initials: 'NJ' },
];

export const DEFAULT_SETTINGS: Settings = {
  storeName: 'Nexora Retail Store',
  address: '12 Market Road, Dhaka 1205',
  phone: '+880 1700 000000',
  email: 'store@example.com',
  taxId: '',
  currencyCode: 'BDT',
  taxEnabled: false,
  taxLabel: 'VAT',
  taxRate: 5,
  taxInclusive: false,
  receiptPrefix: 'NX',
  receiptHeader: '',
  receiptFooter: 'Thank you for shopping with us!',
  receiptShowCashier: true,
  receiptShowTaxId: true,
  receiptPaper: '80mm',
  autoPrint: false,
  lowStockThreshold: 5,
  categories: DEFAULT_CATEGORIES,
  autoSync: true,
};

export const ADJUST_REASONS = ['Stock count correction', 'Damaged', 'Expired', 'Lost or stolen', 'Other'];
