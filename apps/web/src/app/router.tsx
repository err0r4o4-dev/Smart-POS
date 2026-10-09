import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ManagementLayout } from '../layouts/ManagementLayout';
import { POSLayout } from '../layouts/POSLayout';
import { AuthLayout } from '../layouts/AuthLayout';
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
import { POSWorkspace } from '../features/pos/POSWorkspace';
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
          { path: paths.account, element: <AccountPage /> },
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
  { path: paths.posPreview, element: <POSLayout /> },
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
  { path: paths.authPreview, element: <AuthLayout /> },
  { path: paths.login, element: <LoginPage /> },
  { path: paths.register, element: <RegisterPage /> },
  { path: paths.forgotPassword, element: <ForgotPasswordPage /> },
  { path: paths.resetPassword, element: <ResetPasswordPage /> },
  { path: paths.forbidden, element: <SystemPage forbidden /> },
  { path: paths.notFound, element: <SystemPage /> },
  { path: '*', element: <SystemPage /> },
]);
