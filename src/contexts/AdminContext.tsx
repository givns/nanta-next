import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import type { UserData } from '@/types/user';
import { useRouter } from 'next/router';
import { useLiff } from '@/contexts/LiffContext'; // Updated import

interface AdminContextType {
  user: UserData | null;
  isLoading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const { lineUserId, isInitialized } = useLiff(); // Use LiffContext
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const fetchAdminData = useCallback(async () => {
    if (!lineUserId) return;

    try {
      const response = await fetch('/api/user-data', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      if (!response.ok) {
        // Handle different error cases
        if (response.status === 404) {
          router.push('/register');
          return;
        }
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();

      // Handle unregistered users
      if (!data.registered) {
        router.push('/register');
        return;
      }

      // Verify admin status
      if (!['Admin', 'SuperAdmin'].includes(data.user.role)) {
        router.push('/'); // Redirect non-admin users to home
        throw new Error('Unauthorized access');
      }

      setUser(data.user);
      setError(null);
    } catch (error) {
      console.error('Admin authorization failed:', error);
      setError(error instanceof Error ? error.message : 'Authorization failed');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Only fetch admin data if LIFF is initialized and we're mounted
    if (mounted && isInitialized && lineUserId) {
      fetchAdminData();
    }
  }, [fetchAdminData, mounted, isInitialized, lineUserId]);

  const refreshUser = useCallback(async () => {
    if (!mounted || !isInitialized) return;
    setIsLoading(true);
    await fetchAdminData();
  }, [fetchAdminData, mounted, isInitialized]);

  // Handle loading states
  if (!mounted || !isInitialized) {
    return children;
  }

  const contextValue = {
    user,
    isLoading: !mounted || isLoading,
    error,
    refreshUser,
  };

  return (
    <AdminContext.Provider value={contextValue}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);

  // Handle SSR case
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
