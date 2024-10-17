import '../styles/globals.css';
import { useEffect, ErrorInfo, useState } from 'react';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { useLiff } from '../hooks/useLiff';
import LoadingBar from '../components/LoadingBar';

function MyApp({ Component, pageProps }: AppProps) {
  const { isLiffInitialized, lineUserId } = useLiff();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleError = (error: Error, errorInfo: ErrorInfo) => {
      console.error('Caught an error:', error, errorInfo);
    };

    window.addEventListener('error', (event) =>
      handleError(event.error, { componentStack: '' }),
    );

    if (isLiffInitialized) {
      // Add a small delay to ensure the progress bar reaches 100%
      setTimeout(() => setIsLoading(false), 1000);
    }

    return () => {
      window.removeEventListener('error', (event) =>
        handleError(event.error, { componentStack: '' }),
      );
    };
  }, [isLiffInitialized]);

  return (
    <Provider store={store}>
      {isLoading ? (
        <LoadingBar />
      ) : (
        <Component {...pageProps} lineUserId={lineUserId} />
      )}
    </Provider>
  );
}

export default MyApp;
