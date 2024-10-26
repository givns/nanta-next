// hooks/useLiff.ts
import { useState, useEffect } from 'react';
import liff from '@line/liff';

export function useLiff() {
  const [isLiffInitialized, setIsLiffInitialized] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });

        if (!liff.isLoggedIn()) {
          // Redirect to LINE login if not logged in
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        setLineUserId(profile.userId);
        setIsLiffInitialized(true);
      } catch (err) {
        console.error('LIFF initialization failed:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to initialize LIFF',
        );
      }
    };

    initializeLiff();
  }, []);

  return { isLiffInitialized, lineUserId, error };
}
