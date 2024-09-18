// _app.tsx

import '../styles/globals.css';
import { useState, useEffect, ErrorInfo } from 'react';
import { useRouter } from 'next/router';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import liff from '@line/liff';

process.env.TZ = 'Asia/Bangkok';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [isLiffInitialized, setIsLiffInitialized] = useState(false);

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
      <Component {...pageProps} />
    </Provider>
  );
}

export default MyApp;
