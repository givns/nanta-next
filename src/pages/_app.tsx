// _app.tsx

import '../styles/globals.css';
import { useState, useEffect, ErrorInfo } from 'react';
import { useRouter } from 'next/router';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import liff from '@line/liff';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [isLiffInitialized, setIsLiffInitialized] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (error: Error, errorInfo: ErrorInfo) => {
      console.error('Caught an error:', error, errorInfo);
    };

    window.addEventListener('error', (event) =>
      handleError(event.error, { componentStack: '' }),
    );
    return () => {
      window.removeEventListener('error', (event) =>
        handleError(event.error, { componentStack: '' }),
      );
    };
  }, []);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          throw new Error('LIFF ID is not defined');
        }

        await liff.init({ liffId });

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);

          const urlParams = new URLSearchParams(window.location.search);
          const path = urlParams.get('path');
          if (path) {
            router.push(path);
          }
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      } finally {
        setIsLiffInitialized(true);
      }
    };

    initializeLiff();
  }, [router]);

  if (!isLiffInitialized) {
    return <div>Loading...</div>;
  }

  return (
    <Provider store={store}>
      <Component {...pageProps} lineUserId={lineUserId} />
    </Provider>
  );
}

export default MyApp;
