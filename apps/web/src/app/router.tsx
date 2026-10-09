import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ManagementLayout } from '../layouts/ManagementLayout';
import { POSLayout } from '../layouts/POSLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { HelpPage } from '../features/help/HelpPage';
import { SystemPage } from '../features/system/SystemPage';
import { paths } from './routes';
import { RequireSession } from './ProtectedRoute';
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
      {
        element: <RequireSession />,
        children: [{ path: paths.account, element: <AccountPage /> }],
      },
    ],
  },
  { path: paths.posPreview, element: <POSLayout /> },
  { path: paths.authPreview, element: <AuthLayout /> },
  { path: paths.login, element: <LoginPage /> },
  { path: paths.register, element: <RegisterPage /> },
  { path: paths.forgotPassword, element: <ForgotPasswordPage /> },
  { path: paths.resetPassword, element: <ResetPasswordPage /> },
  { path: paths.forbidden, element: <SystemPage forbidden /> },
  { path: paths.notFound, element: <SystemPage /> },
  { path: '*', element: <SystemPage /> },
]);
