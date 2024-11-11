// _app.tsx
import '../styles/globals.css';
import { useEffect, useState } from 'react';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import LoadingProgress from '@/components/LoadingProgress';
import AdminLayout from '@/components/layouts/AdminLayout';
import { LiffProvider } from '@/contexts/LiffContext';
import { AdminProvider } from '@/contexts/AdminContext';
import { useLiff } from '@/hooks/useLiff';

// Create a stable wrapper for admin routes
function AdminWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <AdminLayout>{children}</AdminLayout>
    </AdminProvider>
  );
}

// Main app content wrapper
function AppContent({ Component, pageProps, router }: AppProps) {
  const { isLiffInitialized, lineUserId, error } = useLiff();
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isAdminRoute = router.pathname.startsWith('/admin');

  // Handle mounting and data loading
  useEffect(() => {
    setMounted(true);

    // Only start data loading timer after LIFF is initialized
    if (isLiffInitialized && lineUserId) {
      const timer = setTimeout(() => {
        setIsDataLoaded(true);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isLiffInitialized, lineUserId]);

  // Error handling for LIFF
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">LIFF Error: {error}</div>
      </div>
    );
  }

  // Always show LoadingProgress until data is fully loaded
  if (!mounted || !isDataLoaded) {
    return (
      <LoadingProgress
        isLiffInitialized={isLiffInitialized}
        isDataLoaded={isDataLoaded}
      />
    );
  }

  // For admin routes, wrap with AdminLayout
  if (isAdminRoute) {
    return (
      <AdminWrapper>
        <Component {...pageProps} lineUserId={lineUserId} />
      </AdminWrapper>
    );
  }

  // For regular routes
  return <Component {...pageProps} lineUserId={lineUserId} />;
}

function MyApp(props: AppProps) {
  // For server-side rendering
  if (typeof window === 'undefined') {
    return (
      <Provider store={store}>
        <LoadingProgress isLiffInitialized={false} isDataLoaded={false} />
      </Provider>
    );
  }

  // Client-side rendering with all providers
  return (
    <Provider store={store}>
      <LiffProvider>
        <AppContent {...props} />
      </LiffProvider>
    </Provider>
  );
}

export default MyApp;
