// pages/admin/payroll/index.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { FC } from 'react';
import dynamic from 'next/dynamic';
import LoadingBar from '@/components/LoadingBar';

// Remove type import since we're using dynamic imports
// import type { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';

// Dynamically import components
const PayrollAdminDashboard = dynamic(
  () => import('@/components/payroll/AdminDashboard'),
  {
    ssr: false,
    loading: () => <LoadingBar />,
  },
);

const DashboardSkeletonComponent = dynamic(
  () =>
    import('@/components/dashboard/DashboardSkeleton').then(
      (mod) => mod.DashboardSkeleton,
    ),
  {
    ssr: false,
    loading: () => <LoadingBar />,
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
    return <DashboardSkeletonComponent />;
  }

  if (!isAuthorized) {
    return null;
  }

  return <PayrollAdminDashboard />;
};

export default AdminPayrollPage;
