import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AppProps } from 'next/app';
import liff from '@line/liff';
import '../styles/globals.css'; // Adjust the path if needed

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.LIFF_ID as string });
        if (!liff.isLoggedIn()) {
          liff.login();
        }
      } catch (error) {
        console.error('LIFF initialization failed', error);
      }
    };

    if (router.pathname === '/register') {
      initLiff();
    }
  }, [router.pathname]);

  return <Component {...pageProps} />;
}

export default MyApp;