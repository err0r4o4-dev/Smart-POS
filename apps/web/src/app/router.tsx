import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ManagementLayout } from '../layouts/ManagementLayout';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { HelpPage } from '../features/help/HelpPage';
import { SystemPage } from '../features/system/SystemPage';
import { paths } from './routes';
import { RequireSession } from './ProtectedRoute';
import { OrganizationGate } from '../features/organization/OrganizationGate';
import {
  ProductsPage,
  ProductDetailsPage,
  ProductEditorPage,
} from '../features/catalog/ProductPages';
import { TaxonomyPage } from '../features/catalog/TaxonomyPage';
import { ImportPage } from '../features/catalog/ImportPage';
import { LabelsPage } from '../features/catalog/LabelsPage';
import { InventoryPage } from '../features/inventory/InventoryPage';
import { PurchasingPage } from '../features/purchasing/PurchasingPage';
import { ShelfPage } from '../features/purchasing/ShelfPage';
import { ReturnsPage } from '../features/returns/ReturnsPage';
import { AdjustmentsPage } from '../features/returns/AdjustmentsPage';
import { POSWorkspace } from '../features/pos/POSWorkspace';
import { PricingPage } from '../features/pricing/PricingPage';
import { CustomersPage } from '../features/customers/CustomerPages';
import { LoyaltyPage } from '../features/loyalty/LoyaltyPage';
import { QualityPage } from '../features/quality/QualityPage';
import {
  POSTerminalPage,
  HeldCartsPage,
  CheckoutPage,
  RegisterPage as POSRegisterPage,
} from '../features/pos/POSPages';
import { SalesPage, SaleDetailsPage } from '../features/pos/SalesPages';
import {
  SetupPage,
  StorePage,
  BranchesPage,
  EmployeesPage,
  EmployeePage,
  RolesPage,
} from '../features/organization/OrganizationPages';
import {
  AccountPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from '../features/auth/AuthPages';

export const router = createBrowserRouter([
  {
    element: <ManagementLayout />,
    children: [
      { path: '/', element: <Navigate to={paths.dashboard} replace /> },
      { path: paths.dashboard, element: <DashboardPage /> },
      { path: paths.help, element: <HelpPage /> },
      { path: paths.setup, element: <SetupPage /> },
      {
        element: <RequireSession />,
        children: [
          {
            element: <OrganizationGate permission="loyalty.read" />,
            children: [
              { path: '/loyalty', element: <LoyaltyPage /> },
              { path: '/loyalty/history', element: <LoyaltyPage history /> },
            ],
          },
          {
            element: <OrganizationGate permission="customers.read" />,
            children: [
              { path: '/customers', element: <CustomersPage /> },
              {
                path: '/customers/:id',
                element: <CustomersPage view="detail" />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="customers.groups.read" />,
            children: [
              {
                path: '/customers/groups',
                element: <CustomersPage view="groups" />,
              },
            ],
          },
          { path: paths.account, element: <AccountPage /> },
          {
            element: <OrganizationGate permission="quality.read" />,
            children: [
              { path: '/inventory/batches', element: <QualityPage /> },
              {
                path: '/inventory/expiry',
                element: <QualityPage view="expiry" />,
              },
              {
                path: '/inventory/write-offs',
                element: <QualityPage view="write-offs" />,
              },
              {
                path: '/inventory/recalls',
                element: <QualityPage view="recalls" />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="pricing.read" />,
            children: [
              { path: '/pricing', element: <PricingPage view="overview" /> },
              { path: '/pricing/lists', element: <PricingPage view="lists" /> },
            ],
          },
          {
            element: <OrganizationGate permission="promotions.read" />,
            children: [
              {
                path: '/promotions',
                element: <PricingPage view="promotions" />,
              },
              {
                path: '/promotions/:id',
                element: <PricingPage view="promotions" />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="discount.read" />,
            children: [
              {
                path: '/discount-approvals',
                element: <PricingPage view="approvals" />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="exchange.read" />,
            children: [
              { path: '/pos/exchanges', element: <AdjustmentsPage /> },
            ],
          },
          {
            element: <OrganizationGate permission="sales.void.read" />,
            children: [
              { path: '/sales/voids', element: <AdjustmentsPage reversal /> },
            ],
          },
          {
            element: <OrganizationGate permission="returns.read" />,
            children: [{ path: '/pos/returns', element: <ReturnsPage /> }],
          },
          {
            element: <OrganizationGate permission="refunds.read" />,
            children: [
              { path: '/sales/refunds', element: <ReturnsPage refunds /> },
            ],
          },
          {
            element: <OrganizationGate permission="supplier.read" />,
            children: [
              {
                path: '/suppliers',
                element: <PurchasingPage view="suppliers" />,
              },
              {
                path: '/suppliers/:id',
                element: <PurchasingPage view="supplier" />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="purchasing.read" />,
            children: [
              {
                path: '/purchasing/orders',
                element: <PurchasingPage view="orders" />,
              },
              {
                path: '/purchasing/orders/:id',
                element: <PurchasingPage view="order" />,
              },
              {
                path: '/purchasing/receipts',
                element: <PurchasingPage view="receipts" />,
              },
              {
                path: '/purchasing/returns',
                element: <PurchasingPage view="returns" />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="purchasing.order.create" />,
            children: [
              {
                path: '/purchasing/orders/new',
                element: <PurchasingPage view="new" />,
              },
            ],
          },
          {
            element: (
              <OrganizationGate permission="purchasing.suggestion.read" />
            ),
            children: [
              {
                path: '/purchasing/suggestions',
                element: <PurchasingPage view="suggestions" />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="shelf.read" />,
            children: [
              { path: '/shelves', element: <ShelfPage view="overview" /> },
              { path: '/shelves/:id', element: <ShelfPage view="detail" /> },
              ...['layout', 'replenishments', 'discrepancies'].map((view) => ({
                path: '/shelves/' + view,
                element: <ShelfPage view={view} />,
              })),
            ],
          },
          {
            element: <OrganizationGate permission="shelf.manage" />,
            children: [
              { path: '/shelves/new', element: <ShelfPage view="new" /> },
            ],
          },
          {
            element: <OrganizationGate permission="inventory.read" />,
            children: [
              {
                path: '/shelves/counts',
                element: <InventoryPage section="counts" shelfOnly />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="sales.read" />,
            children: [
              { path: '/sales', element: <SalesPage /> },
              { path: '/sales/:id', element: <SaleDetailsPage /> },
            ],
          },
          {
            element: <OrganizationGate permission="receipts.read" />,
            children: [{ path: '/receipts', element: <SalesPage receipts /> }],
          },
          {
            element: <OrganizationGate permission="inventory.read" />,
            children: [
              {
                path: '/inventory',
                element: <InventoryPage section="overview" />,
              },
              ...[
                'balances',
                'locations',
                'movements',
                'adjustments',
                'counts',
                'transfers',
                'reorder-points',
              ].map((section) => ({
                path: '/inventory/' + section,
                element: <InventoryPage section={section} />,
              })),
              {
                path: '/inventory/counts/:id',
                element: <InventoryPage section="counts" />,
              },
              {
                path: '/inventory/transfers/:id',
                element: <InventoryPage section="transfers" />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="catalog.read" />,
            children: [
              { path: '/products', element: <ProductsPage /> },
              { path: '/products/:id', element: <ProductDetailsPage /> },
              {
                path: '/categories',
                element: <TaxonomyPage key="categories" kind="categories" />,
              },
              {
                path: '/brands',
                element: <TaxonomyPage key="brands" kind="brands" />,
              },
              {
                path: '/units',
                element: <TaxonomyPage key="units" kind="units" />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="catalog.create" />,
            children: [
              { path: '/products/new', element: <ProductEditorPage /> },
            ],
          },
          {
            element: <OrganizationGate permission="catalog.update" />,
            children: [
              {
                path: '/products/:id/edit',
                element: <ProductEditorPage edit />,
              },
            ],
          },
          {
            element: <OrganizationGate permission="catalog.import" />,
            children: [{ path: '/products/import', element: <ImportPage /> }],
          },
          {
            element: <OrganizationGate permission="catalog.labels.print" />,
            children: [{ path: '/products/labels', element: <LabelsPage /> }],
          },
          {
            element: <OrganizationGate />,
            children: [
              { path: paths.store, element: <StorePage /> },
              { path: paths.branches, element: <BranchesPage /> },
            ],
          },
          {
            element: <OrganizationGate permission="employee.read" />,
            children: [
              { path: paths.employees, element: <EmployeesPage /> },
              { path: '/employees/:id', element: <EmployeePage /> },
            ],
          },
          {
            element: <OrganizationGate permission="role.read" />,
            children: [{ path: paths.roles, element: <RolesPage /> }],
          },
        ],
      },
    ],
  },
  {
    element: <RequireSession />,
    children: [
      {
        element: <OrganizationGate permission="pos.access" />,
        children: [
          {
            element: <POSWorkspace />,
            children: [
              { path: '/pos', element: <POSTerminalPage /> },
              { path: '/pos/held-carts', element: <HeldCartsPage /> },
              { path: '/pos/checkout', element: <CheckoutPage /> },
              {
                path: '/pos/register/open',
                element: <POSRegisterPage key="open" section="open" />,
              },
              {
                path: '/pos/register/close',
                element: <POSRegisterPage key="close" section="close" />,
              },
              {
                path: '/pos/register/history',
                element: <POSRegisterPage key="history" section="history" />,
              },
              {
                path: '/pos/shifts',
                element: <POSRegisterPage key="shifts" section="shifts" />,
              },
            ],
          },
        ],
      },
    ],
  },
  { path: paths.login, element: <LoginPage /> },
  { path: paths.register, element: <RegisterPage /> },
  { path: paths.forgotPassword, element: <ForgotPasswordPage /> },
  { path: paths.resetPassword, element: <ResetPasswordPage /> },
  { path: paths.forbidden, element: <SystemPage forbidden /> },
  { path: paths.notFound, element: <SystemPage /> },
  { path: '*', element: <SystemPage /> },
]);
