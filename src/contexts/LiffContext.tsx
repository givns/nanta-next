import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
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
  refreshUserData: () => Promise<void>;
}

const LiffContext = createContext<LiffContextType | null>(null);

const EXCLUDED_PATHS = ['/register'];

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState({
    lineUserId: null as string | null,
    isInitialized: false,
    error: null as string | null,
    userData: null as UserData | null,
    isLoading: true,
    liffState: null as LiffContextType['liffState'],
    mounted: false,
  });

  const isExcludedPath = EXCLUDED_PATHS.includes(router.pathname);

  const fetchUserData = useCallback(
    async (userId: string) => {
      if (isExcludedPath) return null;

      try {
        const response = await fetch('/api/user-data', {
          headers: {
            'x-line-userid': userId,
          },
        });

        if (response.ok) {
          const { user } = await response.json();
          return user;
        } else if (response.status === 404) {
          router.push('/register');
          return null;
        }
        throw new Error('Failed to fetch user data');
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        throw error;
      }
    },
    [router, isExcludedPath],
  );

  const initializeLiff = useCallback(async () => {
    try {
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });

      const liffState = {
        isInClient: liff.isInClient(),
        isLoggedIn: liff.isLoggedIn(),
      };

      if (!liffState.isLoggedIn) {
        liff.login();
        return;
      }

      const profile = await liff.getProfile();
      localStorage.setItem('lineUserId', profile.userId);

      let userData = null;
      try {
        userData = await fetchUserData(profile.userId);
      } catch (error) {
        if (!isExcludedPath) {
          throw error;
        }
      }

      setState((prev) => ({
        ...prev,
        lineUserId: profile.userId,
        userData,
        liffState,
        isInitialized: true,
        error: null,
        isLoading: false,
      }));
    } catch (error) {
      console.error('LIFF initialization failed:', error);
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error ? error.message : 'LIFF initialization failed',
        isLoading: false,
      }));
    }
  }, [fetchUserData, isExcludedPath]);

  const refreshUserData = useCallback(async () => {
    if (!state.lineUserId || !state.isInitialized) return;

    try {
      setState((prev) => ({ ...prev, isLoading: true }));
      const userData = await fetchUserData(state.lineUserId);
      setState((prev) => ({
        ...prev,
        userData,
        error: null,
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to refresh user data',
        isLoading: false,
      }));
    }
  }, [state.lineUserId, state.isInitialized, fetchUserData]);

  useEffect(() => {
    setState((prev) => ({ ...prev, mounted: true }));
  }, []);

  useEffect(() => {
    if (!state.mounted) return;
    initializeLiff();
  }, [state.mounted, initializeLiff]);

  // Handle SSR
  if (typeof window === 'undefined') {
    return children;
  }

  // Handle loading states
  if (!state.mounted || state.isLoading) {
    return <LoadingBar />;
  }

  // Handle errors (except for excluded paths)
  if (state.error && !isExcludedPath) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {state.error}</div>
      </div>
    );
  }

  const contextValue: LiffContextType = {
    lineUserId: state.lineUserId,
    isInitialized: state.isInitialized,
    error: state.error,
    userData: state.userData,
    isLoading: state.isLoading,
    liffState: state.liffState,
    refreshUserData,
  };

  return (
    <LiffContext.Provider value={contextValue}>{children}</LiffContext.Provider>
  );
}

export function useLiff() {
  const context = useContext(LiffContext);

  if (typeof window === 'undefined') {
    return {
      lineUserId: null,
      isInitialized: false,
      error: null,
      userData: null,
      isLoading: true,
      liffState: null,
      refreshUserData: async () => {},
    };
  }

  if (!context) {
    throw new Error('useLiff must be used within LiffProvider');
  }

  return context;
}
