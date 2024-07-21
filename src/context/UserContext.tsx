// UserContext.tsx

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import axios from 'axios';
import { UserRole } from '../types/enum';

interface User {
  id: string;
  lineUserId: string | null;
  name: string;
  nickname: string;
  departmentId: string;
  department: string;
  employeeId: string;
  role: UserRole;
  shiftId: string;
  profilePictureUrl: string | null;
  profilePictureExternal: string | null;
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (lineUserId: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async (lineUserId: string) => {
    try {
      const response = await axios.get(`/api/user?lineUserId=${lineUserId}`);
      setUser(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch user data');
      console.error('Error fetching user:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedLineUserId = localStorage.getItem('lineUserId');
    if (storedLineUserId) {
      fetchUser(storedLineUserId);
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (lineUserId: string) => {
    setLoading(true);
    try {
      await fetchUser(lineUserId);
      localStorage.setItem('lineUserId', lineUserId);
    } catch (err) {
      setError('Login failed');
      console.error('Login error:', err);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('lineUserId');
  };

  const refreshUser = async () => {
    if (user && user.lineUserId) {
      await fetchUser(user.lineUserId);
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    refreshUser,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
