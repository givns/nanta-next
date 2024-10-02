// _app.tsx

import '../styles/globals.css';
import { useState, useEffect, ErrorInfo } from 'react';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import liff from '@line/liff';

function MyApp({ Component, pageProps }: AppProps) {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

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
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        } else {
          await liff.login(); // Wait for login to complete
          const profile = await liff.getProfile(); // Fetch profile after login
          setLineUserId(profile.userId);
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeLiff();
  }, []);

  if (isInitializing) {
    return <div>Initializing application...</div>;
  }

  if (!lineUserId) {
    return (
      <div>
        Unable to fetch user information. Please try refreshing the page.
      </div>
    );
  }

  return (
    <Provider store={store}>
      <Component {...pageProps} liff={liff} lineUserId={lineUserId} />
    </Provider>
  );
}

export default MyApp;
