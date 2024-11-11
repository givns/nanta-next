// components/AppContent.tsx
import { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import store from '../store';
import { useLiff } from '@/contexts/LiffContext';
import { useRouter } from 'next/router';
import type { NextPage } from 'next';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import AdminLayout from './layouts/AdminLayout';
import LoadingBar from '@/components/LoadingBar';

interface AppContentProps {
  Component: NextPage;
  pageProps: any;
}

export default function AppContent({ Component, pageProps }: AppContentProps) {
  const router = useRouter();
  const { isInitialized, lineUserId, error: liffError } = useLiff();
  const [mounted, setMounted] = useState(false);

  const isAdminRoute = router.pathname.startsWith('/admin');
  const isRegisterPage = router.pathname === '/register';

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle SSR
  if (!mounted) {
    return <DashboardSkeleton />;
  }

  // Handle LIFF initialization
  if (!isInitialized) {
    return <LoadingBar />;
  }

  // Handle LIFF errors
  if (liffError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500">เกิดข้อผิดพลาดในการเชื่อมต่อ LIFF</div>
        <div className="text-red-500">{liffError}</div>
      </div>
    );
  }

  // For admin routes
  if (isAdminRoute) {
    return (
      <Provider store={store}>
        <AdminLayout>
          <Component {...pageProps} />
        </AdminLayout>
      </Provider>
    );
  }

  // For all other routes
  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  );
}
