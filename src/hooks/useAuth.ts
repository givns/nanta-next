// hooks/useAuth.ts
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import type { UserData } from '@/types/user';

interface UseAuthOptions {
  required?: boolean;
  requiredRoles?: string[];
}

export function useAuth(options: UseAuthOptions = {}) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // First get the user data
        const userResponse = await fetch('/api/user-data');
        const userData = await userResponse.json();

        if (userData.user) {
          setUser(userData.user);

          // Then check authorization with the lineUserId
          const authResponse = await fetch('/api/admin/auth-check', {
            headers: {
              'x-line-userid': userData.user.lineUserId,
            },
          });

          if (authResponse.ok) {
            const { isAuthorized } = await authResponse.json();
            setIsAuthorized(isAuthorized);

            if (!isAuthorized && options.required) {
              router.replace('/unauthorized');
            }
          } else {
            if (options.required) {
              router.replace('/unauthorized');
            }
          }
        } else if (options.required) {
          router.replace('/login');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        if (options.required) {
          router.replace('/login');
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [options.required, router]);

  return { user, isLoading, isAuthorized };
}
