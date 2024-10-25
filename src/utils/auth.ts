// utils/auth.ts

import { GetServerSideProps, GetServerSidePropsContext } from 'next';
import { useEffect, useState } from 'react';
import liff from '@line/liff';
import prisma from '@/lib/prisma';

export const withLiff = (gssp: GetServerSideProps) => {
  return async (context: GetServerSidePropsContext) => {
    try {
      // Only initialize LIFF if we're on the client side
      if (typeof window !== 'undefined') {
        if (!liff.init) {
          await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        }

        if (!liff.isLoggedIn()) {
          liff.login();
          return {
            props: {},
          };
        }
      }

      // Call the original getServerSideProps
      return await gssp(context);
    } catch (error) {
      console.error('LIFF Error:', error);
      return {
        props: {
          error: 'Failed to initialize LIFF',
        },
      };
    }
  };
};

export async function getUserRole(lineUserId: string): Promise<string | null> {
  console.log('Getting user role for lineUserId:', lineUserId);
  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId: lineUserId },
      select: { role: true },
    });
    console.log('Found user:', user);
    return user?.role || null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

// Useful hook for getting LINE userId
export const useLiff = () => {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initLiff = async () => {
      try {
        if (!liff.init) {
          await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        }

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        }
      } catch (err) {
        console.error('LIFF initialization failed:', err);
        setError('Failed to initialize LIFF');
      } finally {
        setIsLoading(false);
      }
    };

    initLiff();
  }, []);

  return { lineUserId, isLoading, error };
};
