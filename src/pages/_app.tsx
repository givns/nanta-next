// src/pages/_app.tsx
import '../styles/globals.css';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import liff from '@line/liff';

// Create a context to provide the initialized LIFF object
import { createContext } from 'react';
export const LiffContext = createContext<typeof liff | null>(null);

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [liffObject, setLiffObject] = useState<typeof liff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (liffId) {
          await liff.init({ liffId });
          setLiffObject(liff);
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
      } finally {
        setLoading(false);
      }
    };

    initializeLiff();
  }, [router]);

  if (loading) {
    return <div>Loading...</div>; // Or your custom loading component
  }

  return (
    <Provider store={store}>
      <LiffContext.Provider value={liffObject}>
        <Component {...pageProps} />
      </LiffContext.Provider>
    </Provider>
  );
}

export default MyApp;
