import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorBoundary } from '../components/feedback/ErrorBoundary';
import { AuthProvider } from './AuthProvider';
import { LanguageProvider } from './language';

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
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </LanguageProvider>
  );
}
