import '../styles/globals.css';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import LoadingBar from '@/components/LoadingBar';
import { useEffect, useState } from 'react';
import { useLiff } from '@/hooks/useLiff';
import dynamic from 'next/dynamic';

// Define LIFF pages
const LIFF_PAGES = ['/check-in', '/overtime-request', '/leave-request'];

// Create a client-side only content component
const ClientContent = dynamic(
  () =>
    Promise.resolve(function ClientContent({
      Component,
      pageProps,
      router,
    }: AppProps & { router: any }) {
      const [isRouteLoading, setIsRouteLoading] = useState(false);
      const { isLiffInitialized, lineUserId, error: liffError } = useLiff();
      const isAdminRoute = router.pathname.startsWith('/admin');
      const isLiffPage = LIFF_PAGES.some((path) =>
        router.pathname.startsWith(path),
      );

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

      // Handle LIFF pages
      if (isLiffPage) {
        if (!isLiffInitialized) {
          return <LoadingBar />;
        }

        if (liffError) {
          return (
            <div className="flex flex-col items-center justify-center min-h-screen">
              <div className="text-red-500">
                เกิดข้อผิดพลาดในการเชื่อมต่อ LIFF
              </div>
              <div className="text-red-500">{liffError}</div>
            </div>
          );
        }

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

      // Show loading during route changes
      if (isRouteLoading) {
        return <LoadingBar />;
      }

      // Handle admin routes
      if (isAdminRoute) {
        const cachedUserId = localStorage.getItem('lineUserId');

        if (!lineUserId && !cachedUserId) {
          router.replace('/login');
          return <LoadingBar />;
        }

        // Wrap component with AdminLayout but let the component handle its own loading state
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
    }),
  { ssr: false },
);

function MyApp(props: AppProps) {
  // Server-side rendering fallback
  if (typeof window === 'undefined') {
    return <props.Component {...props.pageProps} />;
  }

  // Client-side rendering
  return <ClientContent {...props} />;
}

export default MyApp;
