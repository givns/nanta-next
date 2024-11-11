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

// ... other imports ...

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [liffState, setLiffState] =
    useState<LiffContextType['liffState']>(null);

  const isRegisterPage = router.pathname === '/register';

  useEffect(() => {
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

            const data = await response.json();
            if (response.ok) {
              setUserData(data.user);
            } else if (response.status === 404 && !isRegisterPage) {
              router.push('/register');
              return;
            }
          } catch (error) {
            console.error('Failed to fetch user data:', error);
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
  }, [isRegisterPage, router]);

  // Handle loading states
  if (typeof window === 'undefined') {
    return children;
  }

  if (isLoading) {
    return <LoadingBar />;
  }

  // Don't show error for register page
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
