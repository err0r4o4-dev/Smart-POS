import { managementRoles, type Role } from './access';
import { workspacePath } from './workspace-paths';

export const paths = {
  workspace: '/workspace',
  shop: '/shop',
  system: '/help/system',
  dashboard: '/manage/dashboard',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  account: '/account',
  products: '/products',
  inventory: '/inventory',
  suppliers: '/suppliers',
  purchasing: '/purchasing/orders',
  setup: '/setup',
  settings: '/settings',
  store: '/settings/store',
  storefrontSettings: '/settings/storefront',
  branches: '/settings/branches',
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
  {
    to: '/restaurant/queue',
    label: 'หน้าจอคิวอาหาร',
    icon: 'pos',
    permission: 'online_orders.read',
  },
  {
    to: '/online-orders',
    label: 'ออเดอร์และคิว',
    icon: 'pos',
    permission: 'online_orders.read',
  },
  {
    to: '/sales/refunds',
    label: 'คืนเงิน',
    icon: 'dashboard',
    permission: 'refunds.read',
  },
  {
    to: '/pos',
    label: 'รับออเดอร์หน้าร้าน',
    icon: 'pos',
    permission: 'pos.access',
  },
  {
    to: '/sales',
    label: 'ยอดขาย',
    icon: 'dashboard',
    permission: 'sales.read',
  },
  {
    to: '/receipts',
    label: 'ใบเสร็จ',
    icon: 'dashboard',
    permission: 'receipts.read',
  },
  {
    to: paths.products,
    label: 'เมนูอาหาร',
    icon: 'dashboard',
    permission: 'catalog.read',
  },
  {
    to: paths.settings,
    label: 'การตั้งค่า',
    icon: 'dashboard',
    permission: 'organization.read',
  },
  { to: paths.dashboard, label: 'ภาพรวม', icon: 'dashboard' },
  { to: paths.help, label: 'คู่มือ', icon: 'help' },
];

export const navigation: NavigationItem[] = managementItems.map((item) => ({
  ...item,
  to: workspacePath(item.to, 'management'),
  roles: managementRoles,
}));

export const accountNavigation: NavigationItem[] = [
  { to: paths.workspace, label: 'เข้าพื้นที่ทำงาน', icon: 'dashboard' },
  { to: paths.account, label: 'บัญชี', icon: 'auth' },
  { to: paths.help, label: 'คู่มือ', icon: 'help' },
];

export interface NavigationGroup {
  id: string;
  label: string;
  paths: string[];
}

const managementGroups: NavigationGroup[] = [
  {
    id: 'sales',
    label: 'การขายและคิว',
    paths: ['/pos', '/online-orders', '/restaurant/queue'],
  },
  {
    id: 'menu',
    label: 'เมนูอาหาร',
    paths: [paths.products],
  },
  {
    id: 'reports',
    label: 'รายงาน',
    paths: ['/sales', '/receipts', '/sales/refunds'],
  },
  {
    id: 'settings',
    label: 'ตั้งค่าร้าน',
    paths: [paths.settings],
  },
];

export const navigationGroups: NavigationGroup[] = managementGroups.map(
  (group) => ({
    ...group,
    paths: group.paths.map((path) => workspacePath(path, 'management')),
  }),
);
