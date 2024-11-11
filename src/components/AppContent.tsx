import { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import store from '../store';
import LoadingBar from '@/components/LoadingBar';
import { useLiff } from '@/contexts/LiffContext';
import { useRouter } from 'next/router';
import type { NextPage } from 'next';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from './layouts/AdminLayout';

interface AppContentProps {
  Component: NextPage;
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
  const [mounted, setMounted] = useState(false);
  const isRegisterPage = router.pathname === '/register';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleStart = () => setIsRouteLoading(true);
    const handleComplete = () => setIsRouteLoading(false);
    const handleError = () => setIsRouteLoading(false);

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleError);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleError);
    };
  }, [router]);

  // Handle SSR and initial mounting
  if (typeof window === 'undefined' || !mounted) {
    return <DashboardSkeleton />;
  }

  // Show loading state during route changes
  if (isRouteLoading) {
    return <LoadingBar />;
  }

  // Handle LIFF initialization
  if (isLiffPage && !isInitialized) {
    return <LoadingBar />;
  }

  // Handle LIFF errors
  if (isLiffPage && liffError) {
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

  // Handle admin routes - AdminProvider is handled by withAdminAuth HOC
  if (isAdminRoute) {
    if (!lineUserId) {
      if (!isRegisterPage) {
        router.replace('/register');
      }
      return <LoadingBar />;
    }

    return (
      <Provider store={store}>
        <AdminProvider>
          <AdminLayout>
            <Component {...pageProps} lineUserId={lineUserId} />
          </AdminLayout>
        </AdminProvider>
      </Provider>
    );
  }

  // Handle LIFF pages that are not admin routes or register page
  if (isLiffPage) {
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

  // For regular routes
  return (
    <Provider store={store}>
      <Component {...pageProps} lineUserId={lineUserId} />
    </Provider>
  );
}
