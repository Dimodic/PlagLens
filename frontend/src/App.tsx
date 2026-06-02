import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/auth/AuthProvider';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { router } from '@/routes';

export default function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: 'always',
            placeholderData: keepPreviousData,
          },
          mutations: { retry: 0 },
        },
      }),
    [],
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={150}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ErrorBoundary>
              <RouterProvider router={router} />
            </ErrorBoundary>
          </AuthProvider>
        </QueryClientProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
