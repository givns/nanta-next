// pages/_app.tsx
import '../styles/globals.css';
import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layouts/AdminLayout';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { useLiff } from '../hooks/useLiff';
import LoadingBar from '../components/LoadingBar';
import { useRouter } from 'next/router';

function MyApp({ Component, pageProps }: AppProps) {
  const { isLiffInitialized, lineUserId, error: liffError } = useLiff();
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const isAdminRoute = router.pathname.startsWith('/admin');

  useEffect(() => {
    if (isLiffInitialized) {
      // Store lineUserId in localStorage for persistence
      if (lineUserId) {
        localStorage.setItem('lineUserId', lineUserId);
      }
      setTimeout(() => setIsLoading(false), 1000);
    }
  }, [isLiffInitialized, lineUserId]);

  // Intercept fetch calls to add lineUserId header
  useEffect(() => {
    if (typeof window !== 'undefined' && lineUserId) {
      const originalFetch = window.fetch;
      window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
        init = init || {};
        init.headers = {
          ...init.headers,
          'x-line-userid': lineUserId,
        };
        return originalFetch(input, init);
      };
    }
  }, [lineUserId]);

  // Show loading state while LIFF is initializing
  if (isLoading || !isLiffInitialized) {
    return <LoadingBar />;
  }

  // Show error if LIFF failed to initialize
  if (liffError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500">เกิดข้อผิดพลาดในการเชื่อมต่อ LIFF</div>
        <div className="text-red-500">{liffError}</div>
      </div>
    );
  }

  // Handle admin routes
  if (isAdminRoute) {
    // Make sure we have lineUserId before rendering admin routes
    if (!lineUserId) {
      router.replace('/login');
      return <LoadingBar />;
    }

    return (
      <Provider store={store}>
        <AdminLayout>
          <Component {...pageProps} lineUserId={lineUserId} />
        </AdminLayout>
      </Provider>
    );
  }

  // For non-admin routes
  if (!lineUserId) {
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

export default MyApp;
