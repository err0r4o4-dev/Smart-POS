import { lazy } from 'react';

export const RestaurantPage = lazy(() =>
  import('../features/restaurant/RestaurantPage').then((module) => ({
    default: module.RestaurantPage,
  })),
);

export const PaymentSandboxPage = lazy(() =>
  import('../features/storefront/PaymentSandboxPage').then((module) => ({
    default: module.PaymentSandboxPage,
  })),
);

export const LandingPage = lazy(() =>
  import('../features/landing/LandingPage').then((module) => ({
    default: module.LandingPage,
  })),
);
export const StorefrontPage = lazy(() =>
  import('../features/storefront/StorefrontPage').then((module) => ({
    default: module.StorefrontPage,
  })),
);
export const ShopCartPage = lazy(() =>
  import('../features/storefront/ShopCartPage').then((module) => ({
    default: module.ShopCartPage,
  })),
);
export const ShopTrackingPage = lazy(() =>
  import('../features/storefront/ShopTrackingPage').then((module) => ({
    default: module.ShopTrackingPage,
  })),
);
export const OnlineOrdersPage = lazy(() =>
  import('../features/storefront/OnlineOrderPages').then((module) => ({
    default: module.OnlineOrdersPage,
  })),
);
export const OnlineOrderPage = lazy(() =>
  import('../features/storefront/OnlineOrderPages').then((module) => ({
    default: module.OnlineOrderPage,
  })),
);
export const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
export const HelpPage = lazy(() =>
  import('../features/help/HelpPage').then((module) => ({
    default: module.HelpPage,
  })),
);
export const SystemPage = lazy(() =>
  import('../features/system/SystemPage').then((module) => ({
    default: module.SystemPage,
  })),
);
export const ProductsPage = lazy(() =>
  import('../features/catalog/ProductPages').then((module) => ({
    default: module.ProductsPage,
  })),
);
export const ProductDetailsPage = lazy(() =>
  import('../features/catalog/ProductPages').then((module) => ({
    default: module.ProductDetailsPage,
  })),
);
export const ProductEditorPage = lazy(() =>
  import('../features/catalog/ProductPages').then((module) => ({
    default: module.ProductEditorPage,
  })),
);
export const TaxonomyPage = lazy(() =>
  import('../features/catalog/TaxonomyPage').then((module) => ({
    default: module.TaxonomyPage,
  })),
);
export const ReturnsPage = lazy(() =>
  import('../features/returns/ReturnsPage').then((module) => ({
    default: module.ReturnsPage,
  })),
);
export const POSWorkspace = lazy(() =>
  import('../features/pos/POSWorkspace').then((module) => ({
    default: module.POSWorkspace,
  })),
);
export const QualityPage = lazy(() =>
  import('../features/quality/QualityPage').then((module) => ({
    default: module.QualityPage,
  })),
);
export const POSTerminalPage = lazy(() =>
  import('../features/pos/POSTerminalPage').then((module) => ({
    default: module.POSTerminalPage,
  })),
);
export const HeldCartsPage = lazy(() =>
  import('../features/pos/HeldCartsPage').then((module) => ({
    default: module.HeldCartsPage,
  })),
);
export const CheckoutPage = lazy(() =>
  import('../features/pos/CheckoutPage').then((module) => ({
    default: module.CheckoutPage,
  })),
);
export const POSRegisterPage = lazy(() =>
  import('../features/pos/RegisterPage').then((module) => ({
    default: module.RegisterPage,
  })),
);
export const SalesPage = lazy(() =>
  import('../features/pos/SalesPages').then((module) => ({
    default: module.SalesPage,
  })),
);
export const SaleDetailsPage = lazy(() =>
  import('../features/pos/SalesPages').then((module) => ({
    default: module.SaleDetailsPage,
  })),
);
export const SetupPage = lazy(() =>
  import('../features/organization/OrganizationPages').then((module) => ({
    default: module.SetupPage,
  })),
);
export const SettingsPage = lazy(() =>
  import('../features/organization/OrganizationPages').then((module) => ({
    default: module.SettingsPage,
  })),
);
export const StorefrontSettingsPage = lazy(() =>
  import('../features/organization/OrganizationPages').then((module) => ({
    default: module.StorefrontSettingsPage,
  })),
);
export const AccountPage = lazy(() =>
  import('../features/auth/AuthPages').then((module) => ({
    default: module.AccountPage,
  })),
);
export const ForgotPasswordPage = lazy(() =>
  import('../features/auth/AuthPages').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
export const LoginPage = lazy(() =>
  import('../features/auth/AuthPages').then((module) => ({
    default: module.LoginPage,
  })),
);
export const RegisterPage = lazy(() =>
  import('../features/auth/AuthPages').then((module) => ({
    default: module.RegisterPage,
  })),
);
export const ResetPasswordPage = lazy(() =>
  import('../features/auth/AuthPages').then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
