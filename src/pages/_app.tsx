// _app.tsx

import '../styles/globals.css';
import { useState, useEffect, ErrorInfo } from 'react';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import liff from '@line/liff';

function MyApp({ Component, pageProps }: AppProps) {
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

  function MyApp({ Component, pageProps }: AppProps) {
    useEffect(() => {
      const initLiff = async () => {
        try {
          await liff.init({
            liffId: process.env.NEXT_PUBLIC_LIFF_ID as string,
          });
          console.log('LIFF initialized globally');
        } catch (error) {
          console.error('Failed to initialize LIFF globally:', error);
        }
      };

      initLiff();
    }, []);

    return (
      <Provider store={store}>
        <Component {...pageProps} />
      </Provider>
    );
  }
}
export default MyApp;
