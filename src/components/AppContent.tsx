import { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import store from '../store';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import LoadingBar from '@/components/LoadingBar';
import { useLiff } from '@/contexts/LiffContext';
import { useRouter } from 'next/router';

interface AppContentProps {
  Component: React.ComponentType<any>;
  pageProps: any;
  isAdminRoute: boolean;
  isLiffPage: boolean;
}

export default function AppContent({
  Component,
  pageProps,
  isAdminRoute,
  isLiffPage,
}: AppContentProps) {
  const router = useRouter();
  const { isInitialized, lineUserId, error: liffError } = useLiff();
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) {
    return <LoadingBar />;
  }

  if (isRouteLoading) {
    return <LoadingBar />;
  }

  // Handle LIFF pages that are not admin routes
  if (isLiffPage && !isAdminRoute) {
    if (!isInitialized) {
      return <LoadingBar />;
    }

    if (liffError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="text-red-500">เกิดข้อผิดพลาดในการเชื่อมต่อ LIFF</div>
          <div className="text-red-500">{liffError}</div>
        </div>
      );
    }

    return (
      <Provider store={store}>
        <Component {...pageProps} lineUserId={lineUserId} />
      </Provider>
    );
  }

  // Handle admin routes
  if (isAdminRoute) {
    // Important: Wrap the entire admin section with AdminProvider
    return (
      <Provider store={store}>
        <AdminProvider>
          <AdminLayout>
            <Component {...pageProps} />
          </AdminLayout>
        </AdminProvider>
      </Provider>
    );
  }

  // For regular routes
  return (
    <Provider store={store}>
      <Component {...pageProps} lineUserId={lineUserId} />
    </Provider>
  );
}
