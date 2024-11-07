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
  const { lineUserId, isInitialized } = useLiffContext();
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const isAdminRoute = router.pathname.startsWith('/admin');

  // Handle route change loading states
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

  // Check for cached lineUserId if LIFF isn't initialized
  useEffect(() => {
    if (!isInitialized && !lineUserId) {
      const cachedUserId = localStorage.getItem('lineUserId');
      if (!cachedUserId && isAdminRoute) {
        router.replace('/login');
      }
    }
  }, [isInitialized, lineUserId, isAdminRoute]);

  // Show loading only during route changes
  if (isRouteLoading) {
    return <LoadingBar />;
  }

  // Handle admin routes
  if (isAdminRoute) {
    // Use cached lineUserId as fallback
    const cachedUserId = localStorage.getItem('lineUserId');

    if (!lineUserId && !cachedUserId) {
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

  // For non-admin routes
  if (!lineUserId && !localStorage.getItem('lineUserId')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500">กรุณาเข้าสู่ระบบผ่าน LINE</div>
      </div>
    );
  }

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
