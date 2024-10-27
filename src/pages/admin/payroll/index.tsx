// pages/admin/payroll/index.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { FC } from 'react';
import dynamic from 'next/dynamic';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';

// Remove type import since we're using dynamic imports
// import type { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';

// Dynamically import components
const PayrollAdminDashboard = dynamic(
  () => import('@/components/payroll/AdminDashboard'),
  {
    ssr: false,
    loading: () => <DashboardSkeleton />,
  },
);

const AdminPayrollPage: FC = () => {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuthorization = async () => {
      try {
        const response = await fetch('/api/admin/auth-check');
        const data = await response.json();

        if (!data.isAuthorized) {
          router.replace('/unauthorized');
          return;
        }

        setIsAuthorized(true);
      } catch (error) {
        console.error('Auth check failed:', error);
        router.replace('/unauthorized');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthorization();
  }, [router]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!isAuthorized) {
    return null;
  }

  return <PayrollAdminDashboard />;
};

export default AdminPayrollPage;
