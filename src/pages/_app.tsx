// _app.tsx

import '../styles/globals.css';
import { useState, useEffect, ErrorInfo } from 'react';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { LiffProvider } from '../contexts/LiffContext';

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

  return (
    <Provider store={store}>
      <LiffProvider>
        <Component {...pageProps} lineUserId={lineUserId} />
      </LiffProvider>
    </Provider>
  );
}

export default MyApp;
