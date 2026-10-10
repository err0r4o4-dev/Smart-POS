import type { Role } from './access';

export const paths = {
  dashboard: '/dashboard',
  posPreview: '/preview/pos',
  authPreview: '/preview/auth',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  account: '/account',
  products: '/products',
  inventory: '/inventory',
  suppliers: '/suppliers',
  purchasing: '/purchasing/orders',
  shelves: '/shelves',
  setup: '/setup',
  store: '/settings/store',
  branches: '/settings/branches',
  employees: '/employees',
  roles: '/roles',
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
export const navigation: NavigationItem[] = [
  {
    to: '/pos/returns',
    label: 'คืนสินค้าลูกค้า',
    icon: 'pos',
    permission: 'returns.read',
  },
  {
    to: '/pos/exchanges',
    label: 'เปลี่ยนสินค้า',
    icon: 'pos',
    permission: 'exchange.read',
  },
  {
    to: '/sales/voids',
    label: 'กลับรายการขาย',
    icon: 'pos',
    permission: 'sales.void.read',
  },
  {
    to: '/sales/refunds',
    label: 'ติดตามการคืนเงิน',
    icon: 'dashboard',
    permission: 'refunds.read',
  },
  {
    to: '/pos',
    label: 'ขายสินค้า / POS',
    icon: 'pos',
    permission: 'pos.access',
  },
  {
    to: '/sales',
    label: 'ประวัติขาย',
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
    to: paths.inventory,
    label: 'คลังสินค้า / สต็อก',
    icon: 'dashboard',
    permission: 'inventory.read',
  },
  {
    to: paths.suppliers,
    label: 'Supplier',
    icon: 'dashboard',
    permission: 'supplier.read',
  },
  {
    to: paths.purchasing,
    label: 'จัดซื้อ / รับสินค้า',
    icon: 'dashboard',
    permission: 'purchasing.read',
  },
  {
    to: paths.shelves,
    label: 'ชั้นวาง / เติมสินค้า',
    icon: 'dashboard',
    permission: 'shelf.read',
  },
  {
    to: paths.products,
    label: 'สินค้า / แค็ตตาล็อก',
    icon: 'dashboard',
    permission: 'catalog.read',
  },
  { to: paths.setup, label: 'ตั้งค่าร้าน / เลือกองค์กร', icon: 'auth' },
  {
    to: paths.store,
    label: 'ข้อมูลองค์กร',
    icon: 'dashboard',
    permission: 'organization.read',
  },
  {
    to: paths.branches,
    label: 'สาขา',
    icon: 'dashboard',
    permission: 'branch.read',
  },
  {
    to: paths.employees,
    label: 'พนักงาน',
    icon: 'auth',
    permission: 'employee.read',
  },
  {
    to: paths.roles,
    label: 'บทบาทและสิทธิ์',
    icon: 'auth',
    permission: 'role.read',
  },
  { to: paths.dashboard, label: 'Overview', icon: 'dashboard' },
  { to: paths.posPreview, label: 'POS layout', icon: 'pos' },
  { to: paths.authPreview, label: 'Authentication layout', icon: 'auth' },
  { to: paths.help, label: 'Getting started', icon: 'help' },
];
