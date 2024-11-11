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

  useEffect(() => {
    const checkAuth = async () => {
      if (!isInitialized) return;

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
            'x-required-roles': options.requiredRoles?.join(',') || '',
          },
        });

        if (response.status === 404) {
          // User needs registration
          setState({
            user: null,
            isAuthorized: false,
            needsRegistration: true,
          });
          authCache.set(lineUserId, {
            user: null,
            isAuthorized: false,
            needsRegistration: true,
          });

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
          setState({
            user: data.user,
            isAuthorized: data.isAuthorized,
            needsRegistration: false,
            registrationStatus: {
              isComplete: data.user.isRegistrationComplete === 'Yes',
              employeeId: data.user.employeeId,
            },
          });

          // If registration is not complete and we're not on registration page
          if (
            data.user.isRegistrationComplete === 'No' &&
            !options.allowRegistration
          ) {
            router.replace('/register');
            return;
          }
        } else if (response.status === 404) {
          setState({
            user: null,
            isAuthorized: false,
            needsRegistration: true,
            registrationStatus: undefined,
          });

          if (options.required && !options.allowRegistration) {
            router.replace('/register');
          }
        } else {
          throw new Error('Auth check failed');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        if (options.required && !options.allowRegistration) {
          router.replace('/login');
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [
    lineUserId,
    isInitialized,
    options.required,
    options.allowRegistration,
    options.requiredRoles,
  ]);

  return {
    user: state.user,
    isLoading,
    isAuthorized: state.isAuthorized,
    needsRegistration: state.needsRegistration,
    registrationStatus: state.registrationStatus,
  };
}
