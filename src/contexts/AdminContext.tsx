// contexts/AdminContext.tsx
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

  const fetchUserData = async () => {
    try {
      // Get lineUserId from localStorage
      const lineUserId = localStorage.getItem('lineUserId');
      if (!lineUserId) {
        throw new Error('No user ID found');
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
        router.replace('/unauthorized');
        return;
      }

      setUser(data.user);
      setError(null);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to load user data');
      router.replace('/unauthorized');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, [router]);

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
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
