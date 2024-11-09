// contexts/AdminContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import type { UserData } from '@/types/user';
import { useRouter } from 'next/router';
import LoadingBar from '@/components/LoadingBar';

interface AdminContextType {
  user: UserData | null;
  isLoading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const isBrowser = typeof window !== 'undefined';

  // Use useCallback to memoize the fetchUserData function
  const fetchUserData = useCallback(async () => {
    if (!isBrowser) return;

    try {
      const lineUserId = localStorage.getItem('lineUserId');
      if (!lineUserId) {
        throw new Error('No lineUserId found');
      }

      const response = await fetch('/api/user-data', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();

      // Check if user has admin access
      if (!['Admin', 'SuperAdmin'].includes(data.user.role)) {
        throw new Error('Unauthorized - Insufficient privileges');
      }

      setUser(data.user);
      setError(null);
    } catch (error) {
      console.error('Error in authorization flow:', error);
      setError(error instanceof Error ? error.message : 'Authorization failed');

      // Redirect to home or show unauthorized message
      router.replace('/unauthorized');
    } finally {
      setIsLoading(false);
    }
  }, [isBrowser, router]); // Include dependencies

  useEffect(() => {
    if (isBrowser) {
      fetchUserData();
    }
  }, [isBrowser, fetchUserData]); // Include all dependencies

  // Show loading state during initial check
  if (isLoading) {
    return <LoadingBar />;
  }

  // Show error state if not authorized
  if (error || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            Unauthorized Access
          </h1>
          <p className="mt-2 text-gray-600">
            You don&apos;t have permission to access this area.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdminContext.Provider
      value={{
        user,
        isLoading,
        error,
        refreshUser: fetchUserData,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (typeof window === 'undefined') {
    return {
      user: null,
      isLoading: true,
      error: null,
      refreshUser: async () => {},
    };
  }
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
