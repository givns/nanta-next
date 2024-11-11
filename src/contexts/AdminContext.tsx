// contexts/AdminContext.tsx
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
import { useLiff } from '@/hooks/useLiff';

interface AdminContextType {
  user: UserData | null;
  isLoading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const { lineUserId } = useLiff();
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
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();

      // Verify admin status
      if (!['Admin', 'SuperAdmin'].includes(data.user.role)) {
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
  }, [lineUserId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && lineUserId) {
      fetchAdminData();
    }
  }, [fetchAdminData, mounted, lineUserId]);

  // Implement refreshUser function
  const refreshUser = useCallback(async () => {
    if (!mounted) return;
    setIsLoading(true);
    await fetchAdminData();
  }, [fetchAdminData, mounted]);

  // SSR safe value
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
