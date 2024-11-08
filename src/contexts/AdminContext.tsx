import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { UserData } from '@/types/user';

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

      // First fetch user data
      const response = await fetch('/api/user-data', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();

      // Check if user has admin privileges
      if (!['Admin', 'SuperAdmin'].includes(data.user.role)) {
        throw new Error('Unauthorized - Insufficient privileges');
      }

      // Store user data
      setUser(data.user);

      // Check admin authorization
      const authResponse = await fetch('/api/admin/auth-check', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      if (!authResponse.ok) {
        throw new Error('Failed admin authorization check');
      }

      const authData = await authResponse.json();
      if (!authData.isAuthorized) {
        throw new Error('Unauthorized access');
      }

      setError(null);
    } catch (error) {
      console.error('Error in authorization flow:', error);
      setError(error instanceof Error ? error.message : 'Authorization failed');
      if (isBrowser) {
        router.replace('/unauthorized');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize the context
  useEffect(() => {
    if (!isBrowser) return;

    const initializeContext = async () => {
      const lineUserId = localStorage.getItem('lineUserId');
      if (!lineUserId) {
        setError('No user ID found');
        router.replace('/login');
        return;
      }
      await fetchUserData();
    };

    initializeContext();
  }, [router, isBrowser]);

  // Provide SSR-safe fallback
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

  // Handle SSR gracefully
  if (context === undefined && typeof window === 'undefined') {
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
