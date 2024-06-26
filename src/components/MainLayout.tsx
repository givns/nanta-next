import React, { useEffect, ReactNode } from 'react';
import { initializeSyncService } from '../services/SyncService';

interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  useEffect(() => {
    initializeSyncService();
  }, []);

  return <div>{children}</div>;
};

export default MainLayout;
