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
    fetchAdminData();
  }, [fetchAdminData]);

  // Implement refreshUser function
  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    await fetchAdminData();
  }, [fetchAdminData]);

  return (
    <AdminContext.Provider value={{ user, isLoading, error, refreshUser }}>
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
