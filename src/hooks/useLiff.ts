// hooks/useLiff.ts
import { useState, useEffect } from 'react';
import liff from '@line/liff';

export function useLiff() {
  const [isLiffInitialized, setIsLiffInitialized] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Check if already initialized
    if (isLiffInitialized && lineUserId) {
      return;
    }

    // Try to get cached lineUserId first
    const cachedLineUserId = localStorage.getItem('lineUserId');
    if (cachedLineUserId && mounted) {
      setLineUserId(cachedLineUserId);
      setIsLiffInitialized(true);
      return;
    }

    async function initializeLiff() {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });

        if (!mounted) return;

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          localStorage.setItem('lineUserId', profile.userId);
        }

        setIsLiffInitialized(true);
      } catch (err) {
        if (!mounted) return;
        console.error('LIFF initialization error:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to initialize LIFF',
        );
      }
    }

    initializeLiff();

    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array - only run once

  return { isLiffInitialized, lineUserId, error };
}
