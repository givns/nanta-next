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

// Create a wrapper component that uses LIFF
function AppContent({ Component, pageProps, router }: AppProps) {
  const { isLiffInitialized, lineUserId, error } = useLiff();
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const isAdminRoute = router.pathname.startsWith('/admin');

  useEffect(() => {
    const handleError = (error: Error) => {
      console.error('Caught an error:', error);
    };

    window.addEventListener('error', (event) => handleError(event.error));

    if (isLiffInitialized) {
      const timer = setTimeout(() => {
        setIsDataLoaded(true);
      }, 1000);

      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('error', (event) => handleError(event.error));
    };
  }, [isLiffInitialized]);

  // Show loading progress while initializing
  if (!isDataLoaded) {
    return (
      <LoadingProgress
        isLiffInitialized={isLiffInitialized}
        isDataLoaded={isDataLoaded}
      />
    );
  }

  // Error handling for LIFF
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  // For admin routes, wrap with AdminProvider and AdminLayout
  if (isAdminRoute) {
    return (
      <AdminProvider>
        <Component {...pageProps} lineUserId={lineUserId} />
      </AdminProvider>
    );
  }

  // For all other routes
  return <Component {...pageProps} lineUserId={lineUserId} />;
}

function MyApp(props: AppProps) {
  // Handle server-side rendering
  if (typeof window === 'undefined') {
    return <props.Component {...props.pageProps} />;
  }

  // Client-side rendering with all providers
  return (
    <LiffProvider>
      <Provider store={store}>
        <AppContent {...props} />
      </Provider>
    </LiffProvider>
  );
}

export default MyApp;
