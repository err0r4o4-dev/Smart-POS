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
  {to:'/inventory/batches',label:'Batch/Expiry/Quality',icon:'dashboard',permission:'quality.read'},
  {
    to: '/loyalty',
    label: 'สมาชิกและรางวัล / Loyalty',
    icon: 'dashboard',
    permission: 'loyalty.read',
  },
  {
    to: '/customers',
    label: 'ลูกค้า / Customers',
    icon: 'dashboard',
    permission: 'customers.read',
  },
  {
    to: '/pricing',
    label: 'ราคา / Pricing',
    icon: 'dashboard',
    permission: 'pricing.read',
  },
  {
    to: '/promotions',
    label: 'โปรโมชัน / Promotions',
    icon: 'dashboard',
    permission: 'promotions.read',
  },
  {
    to: '/discount-approvals',
    label: 'อนุมัติส่วนลด / Discount approvals',
    icon: 'dashboard',
    permission: 'discount.read',
  },
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

export const navigationGroups = [
  { id: 'sales', label: 'การขาย', paths: ['/pos', '/sales', '/receipts'] },
  {
    id: 'returns',
    label: 'คืนสินค้าและคืนเงิน',
    paths: ['/pos/returns', '/pos/exchanges', '/sales/voids', '/sales/refunds'],
  },
  {
    id: 'customers',
    label: 'ลูกค้าและสมาชิก',
    paths: ['/customers', '/loyalty'],
  },
  {
    id: 'pricing',
    label: 'ราคาและโปรโมชัน',
    paths: ['/pricing', '/promotions', '/discount-approvals'],
  },
  {
    id: 'inventory',
    label: 'สินค้าและสต็อก',
    paths: [paths.products, paths.inventory, paths.shelves, '/inventory/batches'],
  },
  {
    id: 'purchasing',
    label: 'จัดซื้อและซัพพลายเออร์',
    paths: [paths.suppliers, paths.purchasing],
  },
  {
    id: 'settings',
    label: 'ตั้งค่าและผู้ใช้งาน',
    paths: [
      paths.setup,
      paths.store,
      paths.branches,
      paths.employees,
      paths.roles,
      paths.account,
    ],
  },
];
