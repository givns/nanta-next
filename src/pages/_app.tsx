// pages/_app.tsx
import '../styles/globals.css';
import { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { LiffProvider, useLiff } from '@/contexts/LiffContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import LoadingProgress from '@/components/LoadingProgress';
import { useRouter } from 'next/router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function AppContent({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { isInitialized, error: liffError, lineUserId } = useLiff();
  const [mounted, setMounted] = useState(false);

  const isAdminRoute = router.pathname.startsWith('/admin');
  const isRegisterPage = router.pathname === '/register';

  // Only check auth for non-register pages
  const { isLoading: authLoading, registrationStatus } = useAuth({
    required: !isRegisterPage,
    requiredRoles: isAdminRoute ? ['Admin', 'SuperAdmin'] : undefined,
    allowRegistration: isRegisterPage,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle SSR
  if (!mounted) {
    return <LoadingProgress isLiffInitialized={false} isDataLoaded={false} />;
  }

  // Show loading state during LIFF initialization
  if (!isInitialized) {
    return <LoadingProgress isLiffInitialized={false} isDataLoaded={true} />;
  }

  // Handle LIFF errors
  if (liffError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{liffError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Check if we have lineUserId before proceeding with registration
  if (isRegisterPage) {
    if (!lineUserId) {
      return <LoadingProgress isLiffInitialized={true} isDataLoaded={false} />;
    }
    return (
      <Provider store={store}>
        <Component {...pageProps} />
      </Provider>
    );
  }

  // Show loading state during auth check
  if (authLoading) {
    return <LoadingProgress isLiffInitialized={true} isDataLoaded={false} />;
  }

  // Handle registration redirect
  if (!isRegisterPage && registrationStatus?.isComplete === false) {
    router.replace('/register');
    return <LoadingProgress isLiffInitialized={true} isDataLoaded={true} />;
  }

  // For admin routes, wrap with AdminLayout
  if (isAdminRoute) {
    return (
      <Provider store={store}>
        <AdminLayout>
          <Component {...pageProps} />
        </AdminLayout>
      </Provider>
    );
  }

  // For all other routes
  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  );
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
