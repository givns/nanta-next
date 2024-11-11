// pages/_app.tsx
import '../styles/globals.css';
import { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { LiffProvider } from '@/contexts/LiffContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import LoadingProgress from '@/components/LoadingProgress';
import { useRouter } from 'next/router';
import { useAuth } from '@/hooks/useAuth';

function AppContent({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isAdminRoute = router.pathname.startsWith('/admin');
  const { isLoading, isAuthorized, registrationStatus } = useAuth({
    required: isAdminRoute,
    requiredRoles: isAdminRoute ? ['Admin', 'SuperAdmin'] : undefined,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle SSR
  if (!mounted) {
    return <LoadingProgress isLiffInitialized={false} isDataLoaded={false} />;
  }

  // For admin routes, check authorization
  if (isAdminRoute) {
    if (!isAuthorized) {
      router.replace('/');
      return null;
    }

    return (
      <AdminLayout>
        <Component {...pageProps} />
      </AdminLayout>
    );
  }

  // For regular routes, just check registration status
  if (registrationStatus && !registrationStatus.isComplete) {
    router.replace('/register');
    return null;
  }

  // For regular routes
  return <Component {...pageProps} />;
}

export default function App(props: AppProps) {
  return (
    <Provider store={store}>
      <LiffProvider>
        <AppContent {...props} />
      </LiffProvider>
    </Provider>
  );
}
