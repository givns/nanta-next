// hooks/useLiff.ts
import { useState, useEffect } from 'react';
import liff from '@line/liff';

export function useLiff() {
  const [isLiffInitialized, setIsLiffInitialized] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('Starting LIFF initialization...');
    const initializeLiff = async () => {
      try {
        console.log('Initializing LIFF...');
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        console.log('Got user profile:', profile.userId);
        setLineUserId(profile.userId);
        localStorage.setItem('lineUserId', profile.userId);

        setIsLiffInitialized(true);
        console.log('LIFF initialized');
      } catch (err) {
        console.error('LIFF initialization error:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to initialize LIFF',
        );
      }
    };

    initializeLiff();
  }, []);

  return {
    isLiffInitialized,
    lineUserId,
    error,
  };
}
