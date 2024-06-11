import '../styles/globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { initializeLiff } from '@/utils/liff';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeLiff();
        const urlParams = new URLSearchParams(window.location.search);
        const path = urlParams.get('path');
        if (path) {
          router.push(path);
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };

    initialize();
  }, [router]);

  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  );
}

export default MyApp;
