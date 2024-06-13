// pages/_app.tsx
import '../styles/globals.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { initializeLiff } from '@/utils/liff';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [liffInitialized, setLiffInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeLiff();
        setLiffInitialized(true);
        const urlParams = new URLSearchParams(window.location.search);
        const path = urlParams.get('path');
        if (path && router.pathname !== path) {
          router.push(path);
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };

    initialize();
  }, [router]);

  if (!liffInitialized) {
    return <div>Loading...</div>; // Show a loading state while LIFF is initializing
  }

  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  );
}

export default MyApp;
