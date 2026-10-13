import type { Role } from '@/types';

/**
 * IMPORTANT: these checks only change what the UI shows. Anyone with browser
 * dev-tools can bypass them, and all data lives in the browser anyway.
 * Real authorization must be enforced by a server when a backend is added.
 */
export type Permission =
  | 'products:write'
  | 'inventory:write'
  | 'reports:view'
  | 'settings:write'
  | 'sales:viewAll'
  | 'costs:view';

const MATRIX: Record<Role, Permission[]> = {
  admin: ['products:write', 'inventory:write', 'reports:view', 'settings:write', 'sales:viewAll', 'costs:view'],
  cashier: [],
};

export const can = (role: Role, permission: Permission): boolean => MATRIX[role].includes(permission);

export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrator', cashier: 'Cashier' };

/** Rows for the "what can each role do" table on the settings page. */
export const CAPABILITIES: { label: string; admin: boolean; cashier: boolean }[] = [
  { label: 'Ring up sales and print receipts', admin: true, cashier: true },
  { label: 'View products and stock levels', admin: true, cashier: true },
  { label: 'View sales history', admin: true, cashier: true },
  { label: 'See every cashier’s sales', admin: true, cashier: false },
  { label: 'Add, edit and delete products', admin: true, cashier: false },
  { label: 'Restock and adjust inventory', admin: true, cashier: false },
  { label: 'See product costs and profit', admin: true, cashier: false },
  { label: 'View reports', admin: true, cashier: false },
  { label: 'Change store settings and reset data', admin: true, cashier: false },
];
