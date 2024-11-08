import '../styles/globals.css';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { useRouter } from 'next/router';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import LoadingBar from '@/components/LoadingBar';
import { useEffect, useState } from 'react';
import { useLiff } from '@/hooks/useLiff';

// Define LIFF pages
const LIFF_PAGES = ['/check-in', '/overtime-request', '/leave-request'];

function AppContent({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const { isLiffInitialized, lineUserId, error: liffError } = useLiff();
  const isAdminRoute = router.pathname.startsWith('/admin');
  const isLiffPage = LIFF_PAGES.some((path) =>
    router.pathname.startsWith(path),
  );
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

  // Handle LIFF pages
  if (isLiffPage) {
    // Show loading while LIFF initializes
    if (!isLiffInitialized) {
      return <LoadingBar />;
    }

    // Show error if LIFF fails to initialize
    if (liffError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="text-red-500">เกิดข้อผิดพลาดในการเชื่อมต่อ LIFF</div>
          <div className="text-red-500">{liffError}</div>
        </div>
      );
    }

    // Show login prompt if no LINE user ID
    if (!lineUserId) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="text-red-500">กรุณาเข้าสู่ระบบผ่าน LINE</div>
        </div>
      );
    }

    // Render LIFF page with lineUserId
    return (
      <Provider store={store}>
        <Component {...pageProps} lineUserId={lineUserId} />
      </Provider>
    );
  }

  // Show loading during route changes
  if (isRouteLoading) {
    return <LoadingBar />;
  }

  // Handle admin routes
  if (isAdminRoute) {
    const cachedUserId = isBrowser ? localStorage.getItem('lineUserId') : null;

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

  // For other routes
  return (
    <Provider store={store}>
      <Component {...pageProps} lineUserId={lineUserId} />
    </Provider>
  );
}

// Wrap with error boundary if needed
function MyApp(props: AppProps) {
  return <AppContent {...props} />;
}

export default MyApp;
