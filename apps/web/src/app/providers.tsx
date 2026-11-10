import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorBoundary } from '../components/feedback/ErrorBoundary';
import { MockModeBadge } from '../components/feedback/MockModeBadge';
import { initMockApi } from '../mocks/mock-service';
import { AuthProvider } from './AuthProvider';
import { LanguageProvider } from './language';

// Activate mock API fetch interceptor when enabled
initMockApi();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false },
  },
});
export function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {children}
            <MockModeBadge />
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </LanguageProvider>
  );
}