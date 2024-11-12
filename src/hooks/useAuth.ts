// hooks/useAuth.ts
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useLiff } from '@/contexts/LiffContext';
import type { UserData } from '@/types/user';

interface UseAuthOptions {
  required?: boolean;
  requiredRoles?: string[];
  allowRegistration?: boolean;
}

interface AuthState {
  user: UserData | null;
  isAuthorized: boolean;
  needsRegistration: boolean;
  registrationStatus?: {
    isComplete: boolean;
    employeeId?: string;
  };
}

// Cache auth results
export const authCache = new Map<string, AuthState>();

export function useAuth(options: UseAuthOptions = {}) {
  const { lineUserId, isInitialized } = useLiff();
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthorized: false,
    needsRegistration: false,
    registrationStatus: undefined,
  });
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isMounted = useRef(true);
  const checkInProgress = useRef(false);
  const requiredRolesString = options.requiredRoles?.join(',') || '';

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      if (checkInProgress.current || !isMounted.current || !isInitialized)
        return;

      checkInProgress.current = true;

      try {
        // 1. Handle no LINE userId case
        if (!lineUserId) {
          setIsLoading(false);
          if (options.required && !options.allowRegistration) {
            router.replace('/login');
          }
          return;
        }

        // 2. Check cache
        if (authCache.has(lineUserId)) {
          const cachedState = authCache.get(lineUserId)!;
          setState(cachedState);
          setIsLoading(false);

          // Don't redirect if registration is allowed
          if (
            options.required &&
            !cachedState.isAuthorized &&
            !options.allowRegistration
          ) {
            if (cachedState.needsRegistration) {
              router.replace('/register');
            } else {
              router.replace('/unauthorized');
            }
          }
          return;
        }

        // 3. Check auth status
        const response = await fetch('/api/auth/check', {
          headers: {
            'x-line-userid': lineUserId,
            'x-required-roles': requiredRolesString,
          },
        });

        if (!isMounted.current) return;

        // 4. Handle user not found (needs registration)
        if (response.status === 404) {
          const newState = {
            user: null,
            isAuthorized: false,
            needsRegistration: true,
          };

          setState(newState);
          authCache.set(lineUserId, newState);

          // Only redirect if we're not already on the registration page
          // and registration is not explicitly allowed
          const isRegistrationPage = router.pathname === '/register';
          if (
            !isRegistrationPage &&
            options.required &&
            !options.allowRegistration
          ) {
            router.replace('/register');
          }
          return;
        }

        // 5. Handle auth errors
        if (!response.ok) {
          throw new Error('Auth check failed');
        }

        // 6. Process successful auth response
        const data = await response.json();
        const newState = {
          user: data.user,
          isAuthorized: data.isAuthorized,
          needsRegistration: false,
          registrationStatus: {
            isComplete: data.user.isRegistrationComplete === 'Yes',
            employeeId: data.user.employeeId,
          },
        };

        setState(newState);
        authCache.set(lineUserId, newState);

        // Only redirect for incomplete registration if we're not already handling registration
        if (
          data.user.isRegistrationComplete === 'No' &&
          !options.allowRegistration
        ) {
          const isRegistrationPage = router.pathname === '/register';
          if (!isRegistrationPage) {
            router.replace('/register');
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
        checkInProgress.current = false;
      }
    };

    checkAuth();
  }, [
    lineUserId,
    isInitialized,
    options.required,
    options.allowRegistration,
    requiredRolesString,
    router.pathname, // Add pathname to dependencies
  ]);

  return {
    user: state.user,
    isLoading,
    isAuthorized: state.isAuthorized,
    needsRegistration: state.needsRegistration,
    registrationStatus: state.registrationStatus,
  };
}
