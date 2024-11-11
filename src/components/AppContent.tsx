import { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import store from '../store';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import LoadingBar from '@/components/LoadingBar';
import { useLiff } from '@/contexts/LiffContext'; // Updated import
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
  const { isInitialized, lineUserId, error: liffError, userData } = useLiff();
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const isRegisterPage = router.pathname === '/register';

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

  if (isRouteLoading) {
    return <LoadingBar />;
  }

  // Handle LIFF pages
  if (isLiffPage) {
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

    // Special handling for register page
    if (isRegisterPage) {
      return (
        <Provider store={store}>
          <Component {...pageProps} lineUserId={lineUserId} />
        </Provider>
      );
    }

    // For other LIFF pages, check if user is registered
    if (!userData && !isRegisterPage) {
      router.push('/register');
      return <LoadingBar />;
    }

    return (
      <Provider store={store}>
        <Component {...pageProps} lineUserId={lineUserId} />
      </Provider>
    );
  }

  // Handle admin routes
  if (isAdminRoute) {
    // Check for both lineUserId and userData to ensure user is registered
    if (!lineUserId || !userData) {
      if (!isRegisterPage) {
        router.replace('/register');
      }
      return <LoadingBar />;
    }

    // Verify admin role
    if (!['Admin', 'SuperAdmin'].includes(userData.role)) {
      router.replace('/');
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

  // For regular routes
  return (
    <Provider store={store}>
      <Component {...pageProps} lineUserId={lineUserId} />
    </Provider>
  );
}
