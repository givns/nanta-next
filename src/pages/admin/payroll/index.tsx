// pages/admin/payroll/index.tsx
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { NextPage } from 'next';
import { useAuth } from '@/hooks/useAuth';

const PayrollAdminDashboard = dynamic(
  () => import('@/components/admin/payroll/PayrollAdminDashboard'),
  {
    ssr: false,
    loading: () => <DashboardSkeleton />,
  },
);

const AdminPayrollPage: NextPage = () => {
  const { user, isLoading } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  if (isLoading || !user) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      <Head>
        <title>Payroll Management - Admin Dashboard</title>
      </Head>
      <PayrollAdminDashboard />
    </>
  );
};

export default AdminPayrollPage;
