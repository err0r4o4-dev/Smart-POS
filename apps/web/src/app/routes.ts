import { managementRoles, type Role } from './access';

export const paths = {
  workspace: '/workspace',
  shop: '/shop',
  dashboard: '/dashboard',
  pos: '/pos',
  orders: '/orders',
  kitchen: '/kitchen',
  menu: '/menu',
  menuCategories: '/menu/categories',
  menuUnits: '/menu/units',
  sales: '/sales',
  receipts: '/receipts',
  refunds: '/refunds',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  setup: '/setup',
  settings: '/settings',
  storefrontSettings: '/settings/storefront',
  paymentSettings: '/settings/payments',
  help: '/help',
  forbidden: '/403',
  notFound: '/404',
} as const;

export interface NavigationItem {
  to: string;
  label: string;
  icon: 'dashboard' | 'pos' | 'auth' | 'help';
  permission?: string;
  roles?: Role[];
}

const managementItems: NavigationItem[] = [
  { to: paths.dashboard, label: 'ภาพรวม', icon: 'dashboard' },
  {
    to: paths.pos,
    label: 'รับออเดอร์หน้าร้าน',
    icon: 'pos',
    permission: 'pos.access',
  },
  {
    to: paths.orders,
    label: 'ออเดอร์และคิว',
    icon: 'pos',
    permission: 'online_orders.read',
  },
  {
    to: paths.kitchen,
    label: 'หน้าจอคิวอาหาร',
    icon: 'pos',
    permission: 'online_orders.read',
  },
  {
    to: paths.menu,
    label: 'เมนูอาหาร',
    icon: 'dashboard',
    permission: 'catalog.read',
  },
  {
    to: paths.sales,
    label: 'ยอดขาย',
    icon: 'dashboard',
    permission: 'sales.read',
  },
  {
    to: paths.receipts,
    label: 'ใบเสร็จ',
    icon: 'dashboard',
    permission: 'receipts.read',
  },
  {
    to: paths.refunds,
    label: 'คืนเงิน',
    icon: 'dashboard',
    permission: 'refunds.read',
  },
  { to: paths.help, label: 'คู่มือ', icon: 'help' },
];

export const navigation: NavigationItem[] = managementItems.map((item) => ({
  ...item,
  roles: managementRoles,
}));

export const accountNavigation: NavigationItem[] = [
  { to: paths.workspace, label: 'เข้าพื้นที่ทำงาน', icon: 'dashboard' },
  { to: paths.help, label: 'คู่มือ', icon: 'help' },
];

export interface NavigationGroup {
  id: string;
  label: string;
  paths: string[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    id: 'operations',
    label: 'การขายและหน้าร้าน',
    paths: [paths.pos, paths.orders, paths.kitchen],
  },
  {
    id: 'management',
    label: 'จัดการร้าน',
    paths: [paths.menu, paths.sales, paths.receipts, paths.refunds],
  },
  {
    id: 'settings',
    label: 'ตั้งค่าระบบ',
    paths: [],
  },
];
