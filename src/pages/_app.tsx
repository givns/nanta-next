import '../styles/globals.css';
import { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { LiffProvider } from '@/contexts/LiffContext';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import LoadingProgress from '@/components/LoadingProgress';
import { useRouter } from 'next/router';

function AdminRoute({
  Component,
  pageProps,
}: {
  Component: AppProps['Component'];
  pageProps: AppProps['pageProps'];
}) {
  return (
    <AdminProvider>
      <AdminLayout>
        <Component {...pageProps} />
      </AdminLayout>
    </AdminProvider>
  );
}

function AppWrapper({ Component, pageProps, router }: AppProps) {
  const [mounted, setMounted] = useState(false);
  const isAdminRoute = router.pathname.startsWith('/admin');
  const isRegisterPage = router.pathname === '/register';

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle SSR and mounting
  if (typeof window === 'undefined' || !mounted) {
    return <LoadingProgress isLiffInitialized={false} isDataLoaded={false} />;
  }

  // For register page
  if (isRegisterPage) {
    return <Component {...pageProps} />;
  }

  // For admin routes
  if (isAdminRoute) {
    return <AdminRoute Component={Component} pageProps={pageProps} />;
  }

  // For other routes
  return <Component {...pageProps} />;
}

function SafeHydrate({ children }: { children: React.ReactNode }) {
  return (
    <div suppressHydrationWarning>
      {typeof window === 'undefined' ? null : children}
    </div>
  );
}

export default function App(props: AppProps) {
  return (
    <SafeHydrate>
      <Provider store={store}>
        <LiffProvider>
          <AppWrapper {...props} />
        </LiffProvider>
      </Provider>
    </SafeHydrate>
  );
}
