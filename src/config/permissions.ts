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
  owner: ['products:write', 'inventory:write', 'reports:view', 'settings:write', 'sales:viewAll', 'costs:view'],
  cashier: [],
};

export const can = (role: Role, permission: Permission): boolean => MATRIX[role]?.includes(permission) ?? false;

export const ROLE_LABEL: Record<Role, string> = { owner: 'Store Owner', cashier: 'Cashier' };

/** Rows for the "what can each role do" table on the settings page. */
export const CAPABILITIES: { label: string; owner: boolean; cashier: boolean }[] = [
  { label: 'Ring up sales and print receipts', owner: true, cashier: true },
  { label: 'View products and stock levels', owner: true, cashier: true },
  { label: 'View sales history', owner: true, cashier: true },
  { label: 'See every cashier’s sales', owner: true, cashier: false },
  { label: 'Add, edit and delete products', owner: true, cashier: false },
  { label: 'Restock and adjust inventory', owner: true, cashier: false },
  { label: 'Process refunds and returns', owner: true, cashier: false },
  { label: 'See product costs and profit', owner: true, cashier: false },
  { label: 'View analytics and reports', owner: true, cashier: false },
  { label: 'Manage cashiers and store settings', owner: true, cashier: false },
];
