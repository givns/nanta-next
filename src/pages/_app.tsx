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

// Client-side only content component
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
        // Update loading state on route changes
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

      // Check and update `lineUserId` from localStorage if available
      useEffect(() => {
        if (!lineUserId) {
          const cachedUserId = localStorage.getItem('lineUserId');
          if (cachedUserId) {
            // Update lineUserId if stored in localStorage (mock update if necessary)
            // Dispatch or set it accordingly if you have state management for `lineUserId`
          }
        }
      }, [lineUserId]);

      // LIFF Page Handling
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

      // Show LoadingBar only if the route is loading
      if (isRouteLoading) {
        return <LoadingBar />;
      }

      // Admin Route Handling with conditional Layout
      if (isAdminRoute) {
        if (!lineUserId) {
          router.replace('/login');
          return <LoadingBar />;
        }

        // Render the admin component with AdminLayout
        return (
          <AdminProvider>
            <AdminLayout>
              <Component {...pageProps} lineUserId={lineUserId} />
            </AdminLayout>
          </AdminProvider>
        );
      }

      // Default Route Handling (Non-admin, Non-LIFF)
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
