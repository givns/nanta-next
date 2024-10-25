// hooks/useLiff.ts
import { useState, useEffect } from 'react';
import liff from '@line/liff';

interface UseLiffReturn {
  lineUserId: string | null;
  isLoading: boolean;
  error: string | null;
  isLiffInitialized: boolean;
}

export const useLiff = (): UseLiffReturn => {
  const [isLiffInitialized, setIsLiffInitialized] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        }
        setIsLiffInitialized(true);
      } catch (error) {
        console.error('LIFF initialization failed', error);
        setIsLiffInitialized(true); // Still set to true to prevent loading state
      }
    };

    initializeLiff();
  }, []);

  return { isLiffInitialized, lineUserId, isLoading: false, error: null };
};
