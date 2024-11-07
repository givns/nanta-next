import '../styles/globals.css';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { useRouter } from 'next/router';
import { AdminProvider } from '@/contexts/AdminContext';
import AdminLayout from '@/components/layouts/AdminLayout';
import {
  LiffProvider,
  useLiffContext,
} from '@/components/providers/LiffProvider';
import LoadingBar from '@/components/LoadingBar';

function AppContent({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { lineUserId } = useLiffContext();
  const isAdminRoute = router.pathname.startsWith('/admin');

  // Handle admin routes
  if (isAdminRoute) {
    if (!lineUserId) {
      router.replace('/login');
      return <LoadingBar />;
    }

    return (
      <AdminProvider>
        <AdminLayout>
          <Component {...pageProps} />
        </AdminLayout>
      </AdminProvider>
    );
  }

  // For non-admin routes
  if (!lineUserId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500">กรุณาเข้าสู่ระบบผ่าน LINE</div>
      </div>
    );
  }

  return (
    <Provider store={store}>
      <Component {...pageProps} lineUserId={lineUserId} />
    </Provider>
  );
}

function MyApp(props: AppProps) {
  return (
    <LiffProvider>
      <AppContent {...props} />
    </LiffProvider>
  );
}

export default MyApp;
