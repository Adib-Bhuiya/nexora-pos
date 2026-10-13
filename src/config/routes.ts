import { Boxes, ChartColumn, History, LayoutDashboard, Package, Settings, ShoppingCart, type LucideIcon } from 'lucide-react';
import type { Permission } from './permissions';

export interface AppRoute {
  path: string;
  label: string;
  /** Shorter label for the phone nav. */
  short: string;
  icon: LucideIcon;
  permission?: Permission;
}

export const ROUTES: AppRoute[] = [
  { path: '/', label: 'Dashboard', short: 'Dashboard', icon: LayoutDashboard },
  { path: '/checkout', label: 'Point of sale', short: 'Checkout', icon: ShoppingCart },
  { path: '/products', label: 'Products', short: 'Products', icon: Package },
  { path: '/inventory', label: 'Inventory', short: 'Inventory', icon: Boxes },
  { path: '/sales', label: 'Sales history', short: 'Sales', icon: History },
  { path: '/reports', label: 'Reports', short: 'Reports', icon: ChartColumn, permission: 'reports:view' },
  { path: '/settings', label: 'Staff & settings', short: 'Settings', icon: Settings },
];
