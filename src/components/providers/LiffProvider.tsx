import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLiff } from '@/hooks/useLiff';
import LoadingBar from '@/components/LoadingBar';
import { useRouter } from 'next/router';

interface LiffContextType {
  lineUserId: string | null;
  isInitialized: boolean;
  error: string | null;
  isLiffPage: boolean;
}

const LiffContext = createContext<LiffContextType>({
  lineUserId: null,
  isInitialized: false,
  error: null,
  isLiffPage: false,
});

export const useLiffContext = () => useContext(LiffContext);

interface LiffProviderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Helper to determine if current route is a LIFF page
const isLiffPageRoute = (pathname: string): boolean => {
  const liffRoutes = ['/check-in', '/overtime-request', '/leave-request'];
  return liffRoutes.some((route) => pathname.startsWith(route));
};

export function LiffProvider({
  children,
  fallback = <LoadingBar />,
}: LiffProviderProps) {
  const { isLiffInitialized, lineUserId, error: liffError } = useLiff();
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const router = useRouter();
  const isLiffPage = isLiffPageRoute(router.pathname);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const cachedUserId = localStorage.getItem('lineUserId');

        if (isLiffInitialized && lineUserId) {
          // Store lineUserId in localStorage
          localStorage.setItem('lineUserId', lineUserId);

          // Set up fetch interceptor
          const originalFetch = window.fetch;
          window.fetch = function (
            input: RequestInfo | URL,
            init?: RequestInit,
          ) {
            init = init || {};
            init.headers = {
              ...init.headers,
              'x-line-userid': lineUserId,
            };
            return originalFetch(input, init);
          };

          if (mounted) {
            setIsLoading(false);
          }
        } else if (cachedUserId && !isLiffPage) {
          // Use cached lineUserId for non-LIFF pages
          if (mounted) {
            setIsLoading(false);
          }
        } else if (!isLiffInitialized && !isLoading && isLiffPage) {
          // Reset loading state if LIFF becomes uninitialized on LIFF pages
          setIsLoading(true);
        }
      } catch (error) {
        console.error('Error initializing LIFF provider:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [isLiffInitialized, lineUserId, isLiffPage]);

  // Show loading state during initialization
  if ((isLoading || !isLiffInitialized) && isLiffPage) {
    return fallback;
  }

  // Show error if initialization failed on LIFF pages
  if ((liffError || initError) && isLiffPage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500">เกิดข้อผิดพลาดในการเชื่อมต่อ LIFF</div>
        <div className="text-red-500">{liffError || initError}</div>
      </div>
    );
  }

  return (
    <LiffContext.Provider
      value={{
        lineUserId,
        isInitialized: isLiffInitialized,
        error: liffError || initError,
        isLiffPage,
      }}
    >
      {children}
    </LiffContext.Provider>
  );
}
