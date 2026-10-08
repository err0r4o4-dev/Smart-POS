import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ManagementLayout } from '../layouts/ManagementLayout';
import { POSLayout } from '../layouts/POSLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { HelpPage } from '../features/help/HelpPage';
import { SystemPage } from '../features/system/SystemPage';
import { paths } from './routes';

export const router = createBrowserRouter([
  {
    element: <ManagementLayout />,
    children: [
      { path: '/', element: <Navigate to={paths.dashboard} replace /> },
      { path: paths.dashboard, element: <DashboardPage /> },
      { path: paths.help, element: <HelpPage /> },
    ],
  },
  { path: paths.posPreview, element: <POSLayout /> },
  { path: paths.authPreview, element: <AuthLayout /> },
  { path: paths.forbidden, element: <SystemPage forbidden /> },
  { path: paths.notFound, element: <SystemPage /> },
  { path: '*', element: <SystemPage /> },
]);
