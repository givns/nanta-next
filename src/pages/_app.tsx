//_app.tsx is a special file in Next.js that allows you to control page initialization and wrap your pages in additional components. This is useful for things like global CSS, data fetching, and error handling.
import '../styles/globals.css';
import { useEffect, ErrorInfo, useState } from 'react';
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
      // Add a small delay to ensure the progress bar reaches 100%
      setTimeout(() => setIsLoading(false), 1000);
    }
  }, [isLiffInitialized]);

  // Add lineUserId to all API requests
  if (typeof window !== 'undefined') {
    const originalFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        init = init || {};
        init.headers = {
          ...init.headers,
          'x-line-userid': lineUserId ?? '',
        };
      }
      return originalFetch(input, init);
    };
  }

  if (isAdminRoute) {
    return (
      <AdminLayout>
        <Component {...pageProps} />
      </AdminLayout>
    );
  }

  // Show loading state while LIFF is initializing or if we're still loading
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

  // Only render the component if we have a lineUserId
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
