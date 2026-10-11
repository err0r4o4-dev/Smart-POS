import { managementRoles, type Role } from './access';

export const paths = {
  workspace: '/workspace',
  staff: '/staff',
  shop: '/shop',
  system: '/help/system',
  dashboard: '/dashboard',
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
const managementItems: NavigationItem[] = [
  {
    to: '/inventory/batches',
    label: 'Batch/Expiry/Quality',
    icon: 'dashboard',
    permission: 'quality.read',
  },
  {
    to: '/loyalty',
    label: 'สมาชิกและรางวัล / Loyalty',
    icon: 'dashboard',
    permission: 'loyalty.read',
  },
  {
    to: '/customers',
    label: 'ฐานข้อมูลลูกค้า',
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
    label: 'เปิดหน้าขาย POS',
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
    label: 'จัดการสินค้า',
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
  { to: paths.dashboard, label: 'ภาพรวมร้าน', icon: 'dashboard' },
  { to: paths.account, label: 'บัญชีของฉัน', icon: 'auth' },
  { to: paths.help, label: 'คู่มือการใช้งาน', icon: 'help' },
];

export const navigation: NavigationItem[] = managementItems.map((item) => ({
  ...item,
  roles: managementRoles,
}));

export const staffNavigation: NavigationItem[] = [
  { to: paths.staff, label: 'งานของฉัน', icon: 'dashboard' },
  {
    to: '/pos/register/open',
    label: 'เปิดกะขาย',
    icon: 'pos',
    permission: 'pos.register.open',
  },
  { to: '/pos', label: 'ขายหน้าร้าน', icon: 'pos', permission: 'pos.access' },
  {
    to: '/pos/register/close',
    label: 'ปิดกะและนับเงิน',
    icon: 'pos',
    permission: 'pos.register.close',
  },
  ...managementItems.filter((item) =>
    [
      '/sales',
      '/receipts',
      '/pos/returns',
      '/pos/exchanges',
      '/sales/refunds',
      '/sales/voids',
      '/inventory',
      '/shelves',
      '/inventory/batches',
      '/suppliers',
      '/purchasing/orders',
      '/customers',
      '/loyalty',
    ].includes(item.to),
  ),
  {
    to: paths.products,
    label: 'ข้อมูลสินค้า',
    icon: 'dashboard',
    permission: 'catalog.read',
  },
  { to: paths.account, label: 'บัญชีของฉัน', icon: 'auth' },
  { to: paths.help, label: 'คู่มือการใช้งาน', icon: 'help' },
];

export const accountNavigation: NavigationItem[] = [
  { to: paths.workspace, label: 'เข้าสู่พื้นที่ทำงาน', icon: 'dashboard' },
  { to: paths.account, label: 'บัญชีของฉัน', icon: 'auth' },
  { to: paths.setup, label: 'เลือกองค์กร / รับคำเชิญ', icon: 'auth' },
  { to: paths.help, label: 'คู่มือการใช้งาน', icon: 'help' },
];

export interface NavigationGroup {
  id: string;
  label: string;
  paths: string[];
}

export const navigationGroups: NavigationGroup[] = [
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
    paths: [
      paths.products,
      paths.inventory,
      paths.shelves,
      '/inventory/batches',
    ],
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

export const staffNavigationGroups: NavigationGroup[] = [
  {
    id: 'staff-sales',
    label: 'งานขายหน้าร้าน',
    paths: [
      '/pos/register/open',
      '/pos',
      '/pos/register/close',
      '/sales',
      '/receipts',
    ],
  },
  {
    id: 'staff-returns',
    label: 'คืนสินค้าและคืนเงิน',
    paths: ['/pos/returns', '/pos/exchanges', '/sales/voids', '/sales/refunds'],
  },
  {
    id: 'staff-stock',
    label: 'งานสินค้าและคลัง',
    paths: ['/products', '/inventory', '/shelves', '/inventory/batches'],
  },
  {
    id: 'staff-purchasing',
    label: 'งานจัดซื้อ',
    paths: ['/suppliers', '/purchasing/orders'],
  },
  {
    id: 'staff-customers',
    label: 'ข้อมูลลูกค้าและสมาชิก',
    paths: ['/customers', '/loyalty'],
  },
];
