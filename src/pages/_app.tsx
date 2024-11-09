// _app.tsx
import '../styles/globals.css';
import { useEffect, useState } from 'react';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { useLiff } from '@/hooks/useLiff';
import LoadingBar from '@/components/LoadingBar';
import AdminLayout from '@/components/layouts/AdminLayout';

function MyApp({ Component, pageProps, router }: AppProps) {
  const { isLiffInitialized, lineUserId } = useLiff();
  const [isLoading, setIsLoading] = useState(true);
  const isAdminRoute = router.pathname.startsWith('/admin');

  useEffect(() => {
    const handleError = (error: Error) => {
      console.error('Caught an error:', error);
    };

    window.addEventListener('error', (event) => handleError(event.error));

    if (isLiffInitialized) {
      // Add a small delay to ensure the progress bar reaches 100%
      setTimeout(() => setIsLoading(false), 1000);
    }

    return () => {
      window.removeEventListener('error', (event) => handleError(event.error));
    };
  }, [isLiffInitialized]);

  if (isLoading) {
    return <LoadingBar />;
  }

  // For admin routes
  if (isAdminRoute) {
    return (
      <Provider store={store}>
        <AdminLayout>
          <Component {...pageProps} lineUserId={lineUserId} />
        </AdminLayout>
      </Provider>
    );
  }

  // For all other routes
  return (
    <Provider store={store}>
      <Component {...pageProps} lineUserId={lineUserId} />
    </Provider>
  );
}

export default MyApp;
