// src/pages/_app.tsx
import '../styles/globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import liff from '@line/liff';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (liffId) {
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
        } else {
          console.error('LIFF ID is not defined');
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };

    initializeLiff();
  }, [router]);

  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  );
}

export default MyApp;
