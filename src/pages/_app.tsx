import '../styles/globals.css';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { useRouter } from 'next/router';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import {
  LiffProvider,
  useLiffContext,
} from '@/components/providers/LiffProvider';
import LoadingBar from '@/components/LoadingBar';
import { useEffect, useState } from 'react';

function AppContent({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { lineUserId, isInitialized, isLiffPage } = useLiffContext();
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const isAdminRoute = router.pathname.startsWith('/admin');
  const isBrowser = typeof window !== 'undefined';

  // Handle route change loading states
  useEffect(() => {
    if (!isBrowser) return;

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
  }, [router, isBrowser]);

  // Show loading during route changes
  if (isRouteLoading && isBrowser) {
    return <LoadingBar />;
  }

  // Handle admin routes
  if (isAdminRoute) {
    const cachedUserId = isBrowser ? localStorage.getItem('lineUserId') : null;

    if (!lineUserId && !cachedUserId && isBrowser) {
      router.replace('/login');
      return <LoadingBar />;
    }

    return (
      <AdminProvider>
        <AdminLayout>
          <Component {...pageProps} />
        </AdminLayout>
      </AdminProvider>
    );
  }

  // For LIFF pages
  if (isLiffPage && isBrowser) {
    if (!isInitialized) {
      return <LoadingBar />;
    }

    if (!lineUserId) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="text-red-500">กรุณาเข้าสู่ระบบผ่าน LINE</div>
        </div>
      );
    }
  }

  // Default route
  return (
    <Provider store={store}>
      <Component {...pageProps} lineUserId={lineUserId} />
    </Provider>
  );
}

function MyApp(props: AppProps) {
  return (
    <LiffProvider>
      <AppContent {...props} />
    </LiffProvider>
  );
}

export default MyApp;
