import React, { createContext, useContext, useEffect, useState } from 'react';
import type { UserData } from '@/types/user';
import { useRouter } from 'next/router';

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

  const fetchUserData = async () => {
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

      if (!['Admin', 'SuperAdmin'].includes(data.user.role)) {
        throw new Error('Unauthorized - Insufficient privileges');
      }

      setUser(data.user);

      const authResponse = await fetch('/api/admin/auth-check', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      if (!authResponse.ok || !(await authResponse.json()).isAuthorized) {
        throw new Error('Unauthorized access');
      }

      setError(null);
    } catch (error) {
      console.error('Error in authorization flow:', error);
      setError(error instanceof Error ? error.message : 'Authorization failed');
      if (isBrowser) {
        window.location.href = '/unauthorized';
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isBrowser) {
      const lineUserId = localStorage.getItem('lineUserId');
      if (!lineUserId) {
        setError('No user ID found');
        window.location.href = '/login';
        return;
      }
      fetchUserData();
    }
  }, []);

  // SSR fallback value
  if (!isBrowser) {
    return (
      <AdminContext.Provider
        value={{
          user: null,
          isLoading: true,
          error: null,
          refreshUser: async () => {},
        }}
      >
        {children}
      </AdminContext.Provider>
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
