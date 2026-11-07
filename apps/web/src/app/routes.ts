import { managementRoles, type Role } from './access';
import { workspacePath } from './workspace-paths';

export const paths = {
  workspace: '/workspace',
  staff: '/work',
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
    to: '/restaurant/recipes',
    label: 'สูตรอาหาร',
    icon: 'dashboard',
    permission: 'catalog.read',
  },
  {
    to: '/restaurant/tables',
    label: 'โต๊ะอาหาร',
    icon: 'dashboard',
    permission: 'online_orders.manage',
  },
  {
    to: '/restaurant/queue',
    label: 'หน้าจอคิวอาหาร',
    icon: 'pos',
    permission: 'online_orders.read',
  },
  {
    to: '/restaurant/settings',
    label: 'เวลาปิดร้าน',
    icon: 'dashboard',
    permission: 'storefront.manage',
  },
  {
    to: '/restaurant/quick-stock',
    label: 'เพิ่ม / ตรวจนับวัตถุดิบ',
    icon: 'dashboard',
    permission: 'inventory.read',
  },
  {
    to: '/restaurant/forecast',
    label: 'พยากรณ์ (ยังไม่พร้อม)',
    icon: 'dashboard',
    permission: 'sales.read',
  },
  {
    to: '/settings/storefront',
    label: 'หน้าร้านออนไลน์',
    icon: 'dashboard',
    permission: 'storefront.manage',
  },
  {
    to: '/online-orders',
    label: 'ออเดอร์และคิว',
    icon: 'pos',
    permission: 'online_orders.read',
  },
  {
    to: '/inventory/batches',
    label: 'ของเสีย / หมดอายุ',
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
    label: 'ราคาเมนู',
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
    label: 'อนุมัติส่วนลด',
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
    label: 'ยกเลิกรายการขาย',
    icon: 'pos',
    permission: 'sales.void.read',
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
    to: paths.inventory,
    label: 'วัตถุดิบ',
    icon: 'dashboard',
    permission: 'inventory.read',
  },
  {
    to: paths.suppliers,
    label: 'ซัพพลายเออร์',
    icon: 'dashboard',
    permission: 'supplier.read',
  },
  {
    to: paths.purchasing,
    label: 'จัดซื้อ',
    icon: 'dashboard',
    permission: 'purchasing.read',
  },
  {
    to: paths.products,
    label: 'เมนูอาหาร',
    icon: 'dashboard',
    permission: 'catalog.read',
  },
  { to: paths.setup, label: 'ตั้งค่าร้าน', icon: 'auth' },
  {
    to: paths.store,
    label: 'องค์กร',
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
    label: 'สิทธิ์ผู้ใช้',
    icon: 'auth',
    permission: 'role.read',
  },
  { to: paths.dashboard, label: 'ภาพรวม', icon: 'dashboard' },
  { to: paths.account, label: 'บัญชี', icon: 'auth' },
  { to: paths.help, label: 'คู่มือ', icon: 'help' },
];

const restaurantManagementItems = managementItems.filter(
  (item) => item.to !== paths.suppliers && item.to !== paths.purchasing,
);

export const navigation: NavigationItem[] = restaurantManagementItems.map(
  (item) => ({
    ...item,
    to: workspacePath(item.to, 'management'),
    roles: managementRoles,
  }),
);

const staffItems: NavigationItem[] = [
  { to: paths.staff, label: 'งานของฉัน', icon: 'dashboard' },
  {
    to: '/pos/register/open',
    label: 'เปิดกะ',
    icon: 'pos',
    permission: 'pos.register.open',
  },
  {
    to: '/pos',
    label: 'รับออเดอร์หน้าร้าน',
    icon: 'pos',
    permission: 'pos.access',
  },
  {
    to: '/pos/register/close',
    label: 'ปิดกะ',
    icon: 'pos',
    permission: 'pos.register.close',
  },
  ...restaurantManagementItems.filter((item) =>
    [
      '/sales',
      '/receipts',
      '/pos/returns',
      '/pos/exchanges',
      '/sales/refunds',
      '/sales/voids',
      '/inventory',
      '/inventory/batches',
      '/suppliers',
      '/purchasing/orders',
      '/customers',
      '/online-orders',
      '/restaurant/queue',
      '/loyalty',
    ].includes(item.to),
  ),
  {
    to: paths.products,
    label: 'ข้อมูลสินค้า',
    icon: 'dashboard',
    permission: 'catalog.read',
  },
  { to: paths.account, label: 'บัญชี', icon: 'auth' },
  { to: paths.help, label: 'คู่มือ', icon: 'help' },
];

export const staffNavigation: NavigationItem[] = staffItems.map((item) => ({
  ...item,
  to: workspacePath(item.to, 'staff'),
}));

export const accountNavigation: NavigationItem[] = [
  { to: paths.workspace, label: 'เข้าพื้นที่ทำงาน', icon: 'dashboard' },
  { to: paths.account, label: 'บัญชี', icon: 'auth' },
  { to: paths.setup, label: 'เลือกองค์กร', icon: 'auth' },
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
    label: 'เมนูและโปรโมชัน',
    paths: [
      paths.products,
      '/restaurant/recipes',
      '/pricing',
      '/promotions',
      '/discount-approvals',
    ],
  },
  {
    id: 'inventory',
    label: 'วัตถุดิบ',
    paths: [
      paths.inventory,
      '/inventory/batches',
      '/restaurant/quick-stock',
      '/restaurant/forecast',
    ],
  },
  {
    id: 'customers',
    label: 'ลูกค้าและสมาชิก',
    paths: ['/customers', '/loyalty'],
  },
  {
    id: 'reports',
    label: 'รายงาน',
    paths: [
      '/sales',
      '/receipts',
      '/sales/refunds',
      '/sales/voids',
      '/pos/returns',
      '/pos/exchanges',
    ],
  },
  {
    id: 'settings',
    label: 'ตั้งค่าร้าน',
    paths: [
      paths.setup,
      paths.store,
      '/settings/storefront',
      '/restaurant/settings',
      '/restaurant/tables',
      paths.branches,
      paths.employees,
      paths.roles,
      paths.account,
      paths.help,
    ],
  },
];

const staffGroups: NavigationGroup[] = [
  {
    id: 'staff-sales',
    label: 'งานขายและคิว',
    paths: [
      '/pos/register/open',
      '/restaurant/queue',
      '/online-orders',
      '/pos',
      '/pos/register/close',
    ],
  },
  {
    id: 'staff-reports',
    label: 'ยอดขายและการแก้ไข',
    paths: [
      '/sales',
      '/receipts',
      '/pos/returns',
      '/pos/exchanges',
      '/sales/voids',
      '/sales/refunds',
    ],
  },
  {
    id: 'staff-menu',
    label: 'เมนูและวัตถุดิบ',
    paths: ['/products', '/inventory', '/inventory/batches'],
  },
  {
    id: 'staff-customers',
    label: 'ลูกค้าและสมาชิก',
    paths: ['/customers', '/loyalty'],
  },
];
export const navigationGroups: NavigationGroup[] = managementGroups.map(
  (group) => ({
    ...group,
    paths: group.paths.map((path) => workspacePath(path, 'management')),
  }),
);
export const staffNavigationGroups: NavigationGroup[] = staffGroups.map(
  (group) => ({
    ...group,
    paths: group.paths.map((path) => workspacePath(path, 'staff')),
  }),
);
