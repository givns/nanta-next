import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';

export const useLiff = () => {
  const router = useRouter();
  const [isLiffInitialized, setIsLiffInitialized] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          throw new Error('LIFF ID is not defined');
        }

        await liff.init({ liffId });

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);

          const urlParams = new URLSearchParams(window.location.search);
          const path = urlParams.get('path');
          if (path) {
            router.push(path);
          }
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      } finally {
        setIsLiffInitialized(true);
      }
    };

    initializeLiff();
  }, [router]);

  return { isLiffInitialized, lineUserId };
};
