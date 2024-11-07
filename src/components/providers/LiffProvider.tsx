import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLiff } from '@/hooks/useLiff';
import LoadingBar from '@/components/LoadingBar';

interface LiffContextType {
  lineUserId: string | null;
  isInitialized: boolean;
  error: string | null;
}

const LiffContext = createContext<LiffContextType>({
  lineUserId: null,
  isInitialized: false,
  error: null,
});

export const useLiffContext = () => useContext(LiffContext);

interface LiffProviderProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function LiffProvider({
  children,
  fallback = <LoadingBar />,
}: LiffProviderProps) {
  const { isLiffInitialized, lineUserId, error: liffError } = useLiff();
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (isLiffInitialized && lineUserId) {
      try {
        // Store lineUserId in localStorage
        localStorage.setItem('lineUserId', lineUserId);

        // Add interceptor for fetch calls
        const originalFetch = window.fetch;
        window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
          init = init || {};
          init.headers = {
            ...init.headers,
            'x-line-userid': lineUserId,
          };
          return originalFetch(input, init);
        };

        // Delay to ensure smooth transition
        setTimeout(() => {
          if (mounted) {
            setIsLoading(false);
          }
        }, 1000);
      } catch (error) {
        console.error('Error initializing LIFF provider:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
      }
    } else if (!isLiffInitialized && !isLoading) {
      // Reset loading state if LIFF becomes uninitialized
      setIsLoading(true);
    }

    return () => {
      mounted = false;
    };
  }, [isLiffInitialized, lineUserId]);

  // Show loading state while initializing
  if (isLoading || !isLiffInitialized) {
    return fallback;
  }

  // Show error if initialization failed
  if (liffError || initError) {
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
      }}
    >
      {children}
    </LiffContext.Provider>
  );
}
