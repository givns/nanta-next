import '../styles/globals.css';
import { useEffect, useState } from 'react';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { LiffProvider } from '@/contexts/LiffContext';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import LoadingProgress from '@/components/LoadingProgress';

function AppWrapper({ Component, pageProps, router }: AppProps) {
  const [mounted, setMounted] = useState(false);
  const isAdminRoute = router.pathname.startsWith('/admin');
  const isLiffPage =
    router.pathname.startsWith('/liff') ||
    router.pathname === '/register' ||
    isAdminRoute;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle SSR and mounting
  if (typeof window === 'undefined' || !mounted) {
    return <LoadingProgress isLiffInitialized={false} isDataLoaded={false} />;
  }

  // For admin routes
  if (isAdminRoute) {
    return (
      <AdminProvider>
        <AdminLayout>
          <Component {...pageProps} />
        </AdminLayout>
      </AdminProvider>
    );
  }

  // For other routes
  return <Component {...pageProps} />;
}

export default function App(props: AppProps) {
  return (
    <Provider store={store}>
      <LiffProvider>
        <AppWrapper {...props} />
      </LiffProvider>
    </Provider>
  );
}
