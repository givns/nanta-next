import '../styles/globals.css';
import { useEffect, useState } from 'react';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import LoadingProgress from '@/components/LoadingProgress';
import { LiffProvider } from '@/contexts/LiffContext';
import AppContent from '@/components/AppContent';

function MyApp({ Component, pageProps, router }: AppProps) {
  const [mounted, setMounted] = useState(false);
  const isAdminRoute = router.pathname.startsWith('/admin');
  const isLiffPage =
    router.pathname.startsWith('/liff') ||
    router.pathname === '/register' ||
    isAdminRoute;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle SSR
  if (typeof window === 'undefined' || !mounted) {
    return (
      <Provider store={store}>
        <LoadingProgress isLiffInitialized={false} isDataLoaded={false} />
      </Provider>
    );
  }

  // Client-side rendering with all providers
  return (
    <Provider store={store}>
      <LiffProvider>
        <AppContent
          Component={Component}
          pageProps={pageProps}
          isAdminRoute={isAdminRoute}
          isLiffPage={isLiffPage}
        />
      </LiffProvider>
    </Provider>
  );
}

// Add getInitialProps to handle initial data loading if needed
MyApp.getInitialProps = async ({ Component, ctx }: any) => {
  let pageProps = {};

  if (Component.getInitialProps) {
    pageProps = await Component.getInitialProps(ctx);
  }

  return { pageProps };
};

export default MyApp;
