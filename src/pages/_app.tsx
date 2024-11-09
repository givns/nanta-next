import '../styles/globals.css';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import LoadingBar from '@/components/LoadingBar';
import { useEffect, useState } from 'react';
import { LiffProvider } from '@/contexts/LiffContext';
import dynamic from 'next/dynamic';
import React from 'react';

// Define route patterns
const LIFF_PAGES = [
  '/check-in-router', // Main check-in route
  '/overtime-request',
  '/leave-request',
];

// Admin routes are handled separately - no need to include in AUTH_REQUIRED_PAGES
const AUTH_REQUIRED_PAGES = ['/profile', '/settings', '/dashboard'];

// Admin routes pattern - used for route checking
const ADMIN_ROUTES = '/admin';

// Create a type-safe ClientContent component
interface ClientContentProps extends AppProps {
  router: AppProps['router'];
}

// _app.tsx
const ClientContent = dynamic(
  () =>
    Promise.resolve(function ClientContent({
      Component,
      pageProps,
      router,
    }: ClientContentProps) {
      const [isRouteLoading, setIsRouteLoading] = useState(false);
      const isAdminRoute = router.pathname.startsWith('/admin');
      const isLiffPage = LIFF_PAGES.some((path) =>
        router.pathname.startsWith(path),
      );

      // Route change loading states
      useEffect(() => {
        const handleStart = () => setIsRouteLoading(true);
        const handleComplete = () => setIsRouteLoading(false);

        router.events.on('routeChangeStart', handleStart);
        router.events.on('routeChangeComplete', handleComplete);
        router.events.on('routeChangeError', handleComplete);

        return () => {
          router.events.off('routeChangeStart', handleStart);
          router.events.off('routeChangeComplete', handleComplete);
          router.events.off('routeChangeError', handleComplete);
        };
      }, [router]);

      // For admin routes
      if (isAdminRoute) {
        return (
          <ErrorBoundary>
            <AdminProvider>
              <AdminLayout>
                {isRouteLoading ? (
                  <div className="p-4">
                    <LoadingBar />
                  </div>
                ) : (
                  <Component {...pageProps} />
                )}
              </AdminLayout>
            </AdminProvider>
          </ErrorBoundary>
        );
      }

      // For LIFF pages - where LINE login happens
      if (isLiffPage) {
        return (
          <ErrorBoundary>
            <LiffProvider>
              <Provider store={store}>
                {isRouteLoading ? (
                  <div className="p-4">
                    <LoadingBar />
                  </div>
                ) : (
                  <Component {...pageProps} />
                )}
              </Provider>
            </LiffProvider>
          </ErrorBoundary>
        );
      }

      // For other routes
      return (
        <ErrorBoundary>
          <Provider store={store}>
            {isRouteLoading ? (
              <div className="p-4">
                <LoadingBar />
              </div>
            ) : (
              <Component {...pageProps} />
            )}
          </Provider>
        </ErrorBoundary>
      );
    }),
  { ssr: false },
);

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-900">
              Something went wrong
            </h1>
            <p className="mt-2 text-gray-600">
              Please try refreshing the page or contact support if the problem
              persists.
            </p>
            <button
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function MyApp(props: AppProps) {
  // Handle server-side rendering
  if (typeof window === 'undefined') {
    return <props.Component {...props.pageProps} />;
  }

  // Client-side rendering with error boundary
  return <ClientContent {...props} />;
}

// Enable production debugging if needed
if (process.env.NODE_ENV === 'production') {
  // Add any production-specific error reporting here
}

export default MyApp;
