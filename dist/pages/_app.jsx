import { useEffect } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';
import '../styles/globals.css'; // Adjust the path if needed
function MyApp({ Component, pageProps }) {
  const router = useRouter();
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.LIFF_ID });
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
