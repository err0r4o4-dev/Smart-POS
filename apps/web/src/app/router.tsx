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
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  EmailVerificationPage,
  ResetPasswordPage,
} from './route-pages';
import { OrganizationGate } from '../features/organization/OrganizationGate';
import { PageError, RouteLoading } from '../components/feedback/PageError';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
  useParams,
  type RouteObject,
} from 'react-router-dom';
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

function CustomerOrderRedirect() {
  const { slug = '', orderId = '' } = useParams();
  const { search, hash } = useLocation();
  return (
    <Navigate
      to={`/shop/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}${search}${hash}`}
      replace
    />
  );
}

function PaymentSandboxRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`${paths.paymentSettings}${search}${hash}`} replace />;
}

const routes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  {
    path: paths.shop,
    element: <StorefrontLayout />,
    children: [
      { index: true, element: <StorefrontPage /> },
      { path: ':slug', element: <StorefrontPage /> },
      { path: ':slug/cart', element: <ShopCartPage /> },
      { path: ':slug/checkout', element: <ShopCartPage /> },
      { path: ':slug/orders/:orderId', element: <ShopTrackingPage /> },
      { path: ':slug/track/:orderId', element: <CustomerOrderRedirect /> },
    ],
  },
  { path: '/sales/voids', element: <SystemPage /> },
  { path: '/sales/voids/*', element: <SystemPage /> },
  { path: '/sales/refunds', element: <SystemPage /> },
  { path: '/sales/refunds/*', element: <SystemPage /> },
  {
    element: <OrganizationWorkspaceProvider />,
    children: [
      { path: paths.setup, element: <SetupPage /> },
      {
        element: <RoleWorkspaceLayout />,
        children: [
          { path: paths.help, element: <HelpPage /> },
          {
            element: <RequireSession />,
            children: [
              { path: paths.workspace, element: <WorkspaceEntryPage /> },
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
                    path: paths.kitchen,
                    element: <RestaurantPage view="queue" />,
                  },
                  { path: paths.orders, element: <OnlineOrdersPage /> },
                  {
                    path: '/orders/:orderId',
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
                    path: paths.paymentSettings,
                    element: <PaymentSandboxPage />,
                  },
                  {
                    path: '/manage/settings/storefront/payments',
                    element: <PaymentSandboxRedirect />,
                  },
                ],
              },
              {
                element: <OrganizationGate permission="refunds.read" />,
                children: [
                  {
                    path: paths.refunds,
                    element: <ReturnsPage refunds />,
                  },
                  {
                    path: '/refunds/:code',
                    element: <ReturnsPage refunds />,
                  },
                ],
              },
              {
                element: <OrganizationGate permission="sales.read" />,
                children: [
                  { path: paths.sales, element: <SalesPage /> },
                  { path: '/sales/:id', element: <SaleDetailsPage /> },
                ],
              },
              {
                element: <OrganizationGate permission="receipts.read" />,
                children: [
                  { path: paths.receipts, element: <SalesPage receipts /> },
                ],
              },
              {
                element: <OrganizationGate permission="catalog.read" />,
                children: [
                  { path: paths.menu, element: <ProductsPage /> },
                  { path: '/menu/:id', element: <ProductDetailsPage /> },
                  {
                    path: paths.menuCategories,
                    element: (
                      <TaxonomyPage key="categories" kind="categories" />
                    ),
                  },
                  {
                    path: paths.menuUnits,
                    element: <TaxonomyPage key="units" kind="units" />,
                  },
                ],
              },
              {
                element: <OrganizationGate permission="catalog.create" />,
                children: [
                  { path: '/menu/new', element: <ProductEditorPage /> },
                ],
              },
              {
                element: <OrganizationGate permission="catalog.update" />,
                children: [
                  {
                    path: '/menu/:id/edit',
                    element: <ProductEditorPage edit />,
                  },
                ],
              },
              {
                element: <OrganizationGate roles={managementRoles} />,
                children: [
                  { path: paths.settings, element: <SettingsPage /> },
                  {
                    path: paths.storefrontSettings,
                    element: <StorefrontSettingsPage />,
                  },
                ],
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
                  { path: paths.pos, element: <POSTerminalPage /> },
                  { path: '/pos/held-carts', element: <HeldCartsPage /> },
                  { path: '/pos/checkout', element: <CheckoutPage /> },
                  {
                    path: '/pos/shifts',
                    element: <POSRegisterPage key="shifts" section="shifts" />,
                  },
                  {
                    path: '/pos/shifts/open',
                    element: <POSRegisterPage key="open" section="open" />,
                  },
                  {
                    path: '/pos/shifts/close',
                    element: <POSRegisterPage key="close" section="close" />,
                  },
                  {
                    path: '/pos/shifts/history',
                    element: (
                      <POSRegisterPage key="history" section="history" />
                    ),
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
  { path: paths.verifyEmail, element: <EmailVerificationPage /> },
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
    children: routes,
  },
]);
