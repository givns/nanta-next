// contexts/LiffContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import liff from '@line/liff';
import { useRouter } from 'next/router';

interface LiffContextType {
  lineUserId: string | null;
  isInitialized: boolean;
  error: string | null;
  isLoading: boolean;
  liffState: {
    isInClient: boolean;
    isLoggedIn: boolean;
  } | null;
}

const LiffContext = createContext<LiffContextType | null>(null);

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({
    lineUserId: null as string | null,
    isInitialized: false,
    error: null as string | null,
    isLoading: true,
    liffState: null as LiffContextType['liffState'],
  });

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

      setState({
        lineUserId: profile.userId,
        liffState,
        isInitialized: true,
        error: null,
        isLoading: false,
      });
    } catch (error) {
      console.error('LIFF initialization failed:', error);
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error ? error.message : 'LIFF initialization failed',
        isLoading: false,
      }));
    }
  }, []);

  useEffect(() => {
    initializeLiff();
  }, [initializeLiff]);

  return <LiffContext.Provider value={state}>{children}</LiffContext.Provider>;
}

export function useLiff() {
  const context = useContext(LiffContext);
  if (!context) {
    throw new Error('useLiff must be used within LiffProvider');
  }
  return context;
}
