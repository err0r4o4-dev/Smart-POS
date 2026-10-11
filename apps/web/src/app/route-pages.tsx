import { lazy } from 'react';

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
export const ImportPage = lazy(() =>
  import('../features/catalog/ImportPage').then((module) => ({
    default: module.ImportPage,
  })),
);
export const LabelsPage = lazy(() =>
  import('../features/catalog/LabelsPage').then((module) => ({
    default: module.LabelsPage,
  })),
);
export const InventoryPage = lazy(() =>
  import('../features/inventory/InventoryPage').then((module) => ({
    default: module.InventoryPage,
  })),
);
export const PurchasingPage = lazy(() =>
  import('../features/purchasing/PurchasingPage').then((module) => ({
    default: module.PurchasingPage,
  })),
);
export const ShelfPage = lazy(() =>
  import('../features/purchasing/ShelfPage').then((module) => ({
    default: module.ShelfPage,
  })),
);
export const ReturnsPage = lazy(() =>
  import('../features/returns/ReturnsPage').then((module) => ({
    default: module.ReturnsPage,
  })),
);
export const AdjustmentsPage = lazy(() =>
  import('../features/returns/AdjustmentsPage').then((module) => ({
    default: module.AdjustmentsPage,
  })),
);
export const POSWorkspace = lazy(() =>
  import('../features/pos/POSWorkspace').then((module) => ({
    default: module.POSWorkspace,
  })),
);
export const PricingPage = lazy(() =>
  import('../features/pricing/PricingPage').then((module) => ({
    default: module.PricingPage,
  })),
);
export const CustomersPage = lazy(() =>
  import('../features/customers/CustomerPages').then((module) => ({
    default: module.CustomersPage,
  })),
);
export const LoyaltyPage = lazy(() =>
  import('../features/loyalty/LoyaltyPage').then((module) => ({
    default: module.LoyaltyPage,
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
export const StorePage = lazy(() =>
  import('../features/organization/OrganizationPages').then((module) => ({
    default: module.StorePage,
  })),
);
export const BranchesPage = lazy(() =>
  import('../features/organization/OrganizationPages').then((module) => ({
    default: module.BranchesPage,
  })),
);
export const EmployeesPage = lazy(() =>
  import('../features/organization/OrganizationPages').then((module) => ({
    default: module.EmployeesPage,
  })),
);
export const EmployeePage = lazy(() =>
  import('../features/organization/OrganizationPages').then((module) => ({
    default: module.EmployeePage,
  })),
);
export const RolesPage = lazy(() =>
  import('../features/organization/OrganizationPages').then((module) => ({
    default: module.RolesPage,
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
