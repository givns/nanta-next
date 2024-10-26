import '../styles/globals.css';
import { useEffect, ErrorInfo, useState } from 'react';
import { AppProps } from 'next/app';
import { Provider } from 'react-redux';
import store from '../store';
import { useLiff } from '../hooks/useLiff';
import LoadingBar from '../components/LoadingBar';

function MyApp({ Component, pageProps }: AppProps) {
  const { isLiffInitialized, lineUserId, error: liffError } = useLiff();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isLiffInitialized) {
      // Add a small delay to ensure the progress bar reaches 100%
      setTimeout(() => setIsLoading(false), 1000);
    }
  }, [isLiffInitialized]);

  // Show loading state while LIFF is initializing or if we're still loading
  if (isLoading || !isLiffInitialized) {
    return <LoadingBar />;
  }

  // Show error if LIFF failed to initialize
  if (liffError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500">เกิดข้อผิดพลาดในการเชื่อมต่อ LIFF</div>
        <div className="text-red-500">{liffError}</div>
      </div>
    );
  }

  // Only render the component if we have a lineUserId
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

export default MyApp;
