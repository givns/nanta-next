// lib/authCache.ts

import { authCache } from '@/hooks/useAuth';

export const invalidateAuthCache = (lineUserId: string) => {
  if (typeof window !== 'undefined') {
    // Clear from map
    authCache.delete(lineUserId);
    // Clear from localStorage if used
    localStorage.removeItem(`auth:${lineUserId}`);
  }
};
