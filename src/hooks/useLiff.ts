import { useState, useEffect } from 'react';
import liff from '@line/liff';

interface UseLiffReturn {
  isLiffInitialized: boolean;
  lineUserId: string | null;
  error: string | null;
  liffObject: typeof liff | null;
}

export function useLiff(): UseLiffReturn {
  const [isLiffInitialized, setIsLiffInitialized] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initializeLiff() {
      try {
        console.log('Initializing LIFF...');

        // Initialize LIFF app
        await liff.init({
          liffId: process.env.NEXT_PUBLIC_LIFF_ID!,
        });

        if (!mounted) return;

        console.log('LIFF initialized');
        setIsLiffInitialized(true);

        // Check if user is logged in
        if (!liff.isLoggedIn()) {
          console.log('User not logged in, redirecting to LINE login...');
          liff.login();
          return;
        }

        // Get user profile
        const profile = await liff.getProfile();
        console.log('Got user profile:', profile.userId);
        setLineUserId(profile.userId);

        // Set up fetch interceptor
        if (typeof window !== 'undefined') {
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
      } catch (err) {
        console.error('LIFF initialization error:', err);
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to initialize LIFF',
          );
        }
      }
    }

    // Only initialize if we're in the browser
    if (typeof window !== 'undefined') {
      console.log('Starting LIFF initialization...');
      initializeLiff();
    }

    return () => {
      mounted = false;
    };
  }, []);

  return {
    isLiffInitialized,
    lineUserId,
    error,
    liffObject: typeof window !== 'undefined' ? liff : null,
  };
}
