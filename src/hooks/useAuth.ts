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
const authCache = new Map<string, AuthState>();

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

  // Add refs to track mounted state and prevent unnecessary effects
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
      // Prevent concurrent checks and check if component is still mounted
      if (checkInProgress.current || !isMounted.current || !isInitialized)
        return;

      checkInProgress.current = true;

      try {
        if (!lineUserId) {
          setIsLoading(false);
          if (options.required) {
            router.replace('/login');
          }
          return;
        }

        // Check cache first
        if (authCache.has(lineUserId)) {
          const cachedState = authCache.get(lineUserId)!;
          setState(cachedState);
          setIsLoading(false);

          if (
            options.required &&
            !cachedState.isAuthorized &&
            !options.allowRegistration
          ) {
            router.replace('/unauthorized');
          }
          return;
        }

        // Check user and auth status
        const response = await fetch('/api/auth/check', {
          headers: {
            'x-line-userid': lineUserId,
            'x-required-roles': requiredRolesString,
          },
        });

        if (!isMounted.current) return;

        if (response.status === 404) {
          const newState = {
            user: null,
            isAuthorized: false,
            needsRegistration: true,
          };

          setState(newState);
          authCache.set(lineUserId, newState);

          if (options.required && !options.allowRegistration) {
            router.replace('/register');
          }
          return;
        }

        if (!response.ok) {
          throw new Error('Auth check failed');
        }

        const data = await response.json();

        if (response.ok) {
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

          if (
            data.user.isRegistrationComplete === 'No' &&
            !options.allowRegistration
          ) {
            router.replace('/register');
            return;
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
    requiredRolesString, // Use memoized string instead of array
  ]);

  return {
    user: state.user,
    isLoading,
    isAuthorized: state.isAuthorized,
    needsRegistration: state.needsRegistration,
    registrationStatus: state.registrationStatus,
  };
}
