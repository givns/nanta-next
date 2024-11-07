import React, { createContext, useContext, useEffect, useState } from 'react';
import liff from '@line/liff';
import { useRouter } from 'next/router';
import LoadingBar from '@/components/LoadingBar';

interface LiffContextType {
  lineUserId: string | null;
  isInitialized: boolean;
  error: string | null;
  profile: any | null;
}

const LiffContext = createContext<LiffContextType>({
  lineUserId: null,
  isInitialized: false,
  error: null,
  profile: null,
});

export const useLiffContext = () => useContext(LiffContext);

interface LiffProviderProps {
  children: React.ReactNode;
}

export function LiffProvider({ children }: LiffProviderProps) {
  const [state, setState] = useState<LiffContextType>({
    lineUserId: null,
    isInitialized: false,
    error: null,
    profile: null,
  });
  const router = useRouter();
  const isAdminRoute = router.pathname.startsWith('/admin');

  useEffect(() => {
    let mounted = true;

    async function initializeLiff() {
      try {
        // Check for cached lineUserId first
        const cachedUserId = localStorage.getItem('lineUserId');
        if (cachedUserId && mounted) {
          setState((prev) => ({
            ...prev,
            lineUserId: cachedUserId,
            isInitialized: true,
          }));
          return;
        }

        // Initialize LIFF
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });

        if (!mounted) return;

        // Handle login state
        if (!liff.isLoggedIn()) {
          if (!isAdminRoute) {
            liff.login();
            return;
          }
        }

        // Get user profile if logged in
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          localStorage.setItem('lineUserId', profile.userId);

          if (mounted) {
            setState({
              lineUserId: profile.userId,
              isInitialized: true,
              error: null,
              profile,
            });

            // Set up fetch interceptor
            const originalFetch = window.fetch;
            window.fetch = function (
              input: RequestInfo | URL,
              init?: RequestInit,
            ) {
              init = init || {};
              init.headers = {
                ...init.headers,
                'x-line-userid': profile.userId,
              };
              return originalFetch(input, init);
            };
          }
        } else {
          setState((prev) => ({
            ...prev,
            isInitialized: true,
          }));
        }
      } catch (error) {
        console.error('LIFF initialization error:', error);
        if (mounted) {
          setState({
            lineUserId: null,
            isInitialized: true,
            error:
              error instanceof Error
                ? error.message
                : 'LIFF initialization failed',
            profile: null,
          });
        }
      }
    }

    initializeLiff();

    return () => {
      mounted = false;
    };
  }, [isAdminRoute]);

  // Show loading state while initializing
  if (!state.isInitialized) {
    return <LoadingBar />;
  }

  // Handle initialization errors
  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500">เกิดข้อผิดพลาดในการเชื่อมต่อ LIFF</div>
        <div className="text-red-500">{state.error}</div>
      </div>
    );
  }

  // Handle non-admin routes that require LINE login
  if (!isAdminRoute && !state.lineUserId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500">กรุณาเข้าสู่ระบบผ่าน LINE</div>
      </div>
    );
  }

  return <LiffContext.Provider value={state}>{children}</LiffContext.Provider>;
}
