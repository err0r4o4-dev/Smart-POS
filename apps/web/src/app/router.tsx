import { Suspense } from 'react';
import {
  LandingPage,
  StorefrontPage,
  ShopCartPage,
  ShopTrackingPage,
  PaymentSandboxPage,
  OnlineOrdersPage,
  OnlineOrderPage,
  RestaurantPage,
  DashboardPage,
  HelpPage,
  SystemPage,
  ProductsPage,
  ProductDetailsPage,
  ProductEditorPage,
  TaxonomyPage,
  ReturnsPage,
  POSWorkspace,
  POSTerminalPage,
  HeldCartsPage,
  CheckoutPage,
  POSRegisterPage,
  SalesPage,
  SaleDetailsPage,
  SetupPage,
  SettingsPage,
  StorefrontSettingsPage,
  AccountPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from './route-pages';
import { OrganizationGate } from '../features/organization/OrganizationGate';
import { PageError, RouteLoading } from '../components/feedback/PageError';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from 'react-router-dom';
import { scopeWorkspaceRoutes } from './workspace-routes';
import { LegacyWorkspaceRedirect } from '../features/workspace/WorkspaceRouting';
import { RoleWorkspaceLayout } from '../layouts/RoleWorkspaceLayout';
import { StorefrontLayout } from '../layouts/StorefrontLayout';
import {
  ManagementHomePage,
  WorkspaceEntryPage,
  OrganizationWorkspaceProvider,
} from '../features/workspace/WorkspacePages';
import { managementRoles } from './access';
import { paths } from './routes';
import { RequireSession } from './ProtectedRoute';

const retiredRetailPaths = [
  '/suppliers',
  '/suppliers/*',
  '/purchasing',
  '/purchasing/*',
  '/shelves',
  '/shelves/*',
  '/inventory',
  '/inventory/*',
  '/restaurant/recipes',
  '/restaurant/recipes/*',
  '/restaurant/quick-stock',
  '/restaurant/quick-stock/*',
  '/restaurant/forecast',
  '/restaurant/forecast/*',
  '/loyalty',
  '/loyalty/*',
  '/customers',
  '/customers/*',
  '/pricing',
  '/pricing/*',
  '/promotions',
  '/promotions/*',
  '/discount-approvals',
  '/discount-approvals/*',
  '/brands',
  '/brands/*',
  '/products/import',
  '/products/labels',
  '/pos/exchanges',
  '/pos/exchanges/*',
  '/pos/returns',
  '/pos/returns/*',
  '/sales/voids',
  '/sales/voids/*',
];

const routes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  {
    path: paths.shop,
    element: <StorefrontLayout />,
    children: [
      { index: true, element: <StorefrontPage /> },
      { path: ':slug', element: <StorefrontPage /> },
      { path: ':slug/cart', element: <ShopCartPage /> },
      { path: ':slug/track/:orderId', element: <ShopTrackingPage /> },
    ],
  },
  {
    element: <OrganizationWorkspaceProvider />,
    children: [
      {
        element: <RoleWorkspaceLayout />,
        children: [
          { path: paths.system, element: <DashboardPage /> },
          { path: paths.help, element: <HelpPage /> },
          { path: paths.setup, element: <SetupPage /> },
          {
            element: <RequireSession />,
            children: [
              { path: paths.workspace, element: <WorkspaceEntryPage /> },
              {
                path: '/dashboard',
                element: <LegacyWorkspaceRedirect path="/dashboard" />,
              },
              {
                path: '/manage',
                element: <Navigate to={paths.dashboard} replace />,
              },
              {
                element: <OrganizationGate />,
                children: [
                  { path: paths.dashboard, element: <ManagementHomePage /> },
                ],
              },
              {
                element: <OrganizationGate permission="online_orders.read" />,
                children: [
                  {
                    path: '/restaurant/queue',
                    element: <RestaurantPage view="queue" />,
                  },
                  { path: '/online-orders', element: <OnlineOrdersPage /> },
                  {
                    path: '/online-orders/:orderId',
                    element: <OnlineOrderPage />,
                  },
                ],
              },
              {
                element: (
                  <OrganizationGate
                    permission="storefront.manage"
                    roles={managementRoles}
                  />
                ),
                children: [
                  {
                    path: '/settings/storefront/payments',
                    element: <PaymentSandboxPage />,
                  },
                ],
              },
              { path: paths.account, element: <AccountPage /> },
              {
                element: <OrganizationGate permission="refunds.read" />,
                children: [
                  {
                    path: '/sales/refunds',
                    element: <ReturnsPage refunds />,
                  },
                  {
                    path: '/sales/refunds/:code',
                    element: <ReturnsPage refunds />,
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
                children: [
                  { path: '/receipts', element: <SalesPage receipts /> },
                ],
              },
              {
                element: <OrganizationGate permission="catalog.read" />,
                children: [
                  { path: '/products', element: <ProductsPage /> },
                  { path: '/products/:id', element: <ProductDetailsPage /> },
                  {
                    path: '/categories',
                    element: (
                      <TaxonomyPage key="categories" kind="categories" />
                    ),
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
                element: <OrganizationGate roles={managementRoles} />,
                children: [
                  { path: paths.settings, element: <SettingsPage /> },
                  {
                    path: paths.store,
                    element: <Navigate to={paths.settings} replace />,
                  },
                  {
                    path: paths.branches,
                    element: <Navigate to={paths.settings} replace />,
                  },
                  {
                    path: paths.storefrontSettings,
                    element: <StorefrontSettingsPage />,
                  },
                  {
                    path: '/restaurant/settings',
                    element: <Navigate to={paths.settings} replace />,
                  },
                  {
                    path: '/restaurant/tables',
                    element: <Navigate to={paths.settings} replace />,
                  },
                ],
              },
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
                        element: (
                          <POSRegisterPage key="history" section="history" />
                        ),
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
];

export const router = createBrowserRouter([
  {
    element: (
      <Suspense fallback={<RouteLoading />}>
        <Outlet />
      </Suspense>
    ),
    errorElement: <PageError />,
    children: [
      ...['', '/manage'].flatMap((prefix) =>
        retiredRetailPaths.map((path) => ({
          path: prefix + path,
          element: <SystemPage />,
        })),
      ),
      ...scopeWorkspaceRoutes(routes),
    ],
  },
]);
