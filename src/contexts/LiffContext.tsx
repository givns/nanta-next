import React, { createContext, useContext, useEffect, useState } from 'react';
import liff from '@line/liff';
import { useRouter } from 'next/router';
import LoadingBar from '@/components/LoadingBar';
import type { UserData } from '@/types/user';

interface LiffContextType {
  lineUserId: string | null;
  isInitialized: boolean;
  error: string | null;
  userData: UserData | null;
  isLoading: boolean;
  liffState: {
    isInClient: boolean;
    isLoggedIn: boolean;
  } | null;
}

const LiffContext = createContext<LiffContextType | null>(null);

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [liffState, setLiffState] =
    useState<LiffContextType['liffState']>(null);
  const [mounted, setMounted] = useState(false);

  const isRegisterPage = router.pathname === '/register';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });

        setLiffState({
          isInClient: liff.isInClient(),
          isLoggedIn: liff.isLoggedIn(),
        });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        setLineUserId(profile.userId);
        localStorage.setItem('lineUserId', profile.userId);

        // Skip user data fetch for registration page
        if (!isRegisterPage) {
          try {
            const response = await fetch('/api/user-data', {
              headers: {
                'x-line-userid': profile.userId,
              },
            });

            if (response.ok) {
              const { user } = await response.json();
              setUserData(user);
            } else if (response.status === 404) {
              // Redirect to register if user not found
              router.push('/register');
              return;
            }
          } catch (error) {
            console.error('Failed to fetch user data:', error);
            // Don't set error for registration page
            if (!isRegisterPage) {
              setError('Failed to fetch user data');
            }
          }
        }

        setIsInitialized(true);
        setError(null);
      } catch (error) {
        console.error('LIFF initialization failed', error);
        setError(
          error instanceof Error ? error.message : 'LIFF initialization failed',
        );
      } finally {
        setIsLoading(false);
      }
    };

    initLiff();
  }, [mounted, isRegisterPage, router]);

  // Don't show loading on server
  if (typeof window === 'undefined') {
    return children;
  }

  if (!mounted || isLoading) {
    return <LoadingBar />;
  }

  if (error && !isRegisterPage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  const contextValue: LiffContextType = {
    lineUserId,
    isInitialized,
    error,
    userData,
    isLoading,
    liffState,
  };

  return (
    <LiffContext.Provider value={contextValue}>{children}</LiffContext.Provider>
  );
}

export function useLiff() {
  const context = useContext(LiffContext);

  // Handle SSR case
  if (typeof window === 'undefined') {
    return {
      lineUserId: null,
      isInitialized: false,
      error: null,
      userData: null,
      isLoading: true,
      liffState: null,
    };
  }

  if (!context) {
    throw new Error('useLiff must be used within LiffProvider');
  }

  return context;
}
