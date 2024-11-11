// pages/admin/payroll/index.tsx
import { useAdmin } from '@/contexts/AdminContext';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { NextPage } from 'next';
import { withAdminAuth } from '@/utils/withAdminAuth';

const PayrollAdminDashboard = dynamic(
  () => import('@/components/admin/payroll/PayrollAdminDashboard'),
  {
    ssr: false,
    loading: () => <DashboardSkeleton />,
  },
);

const AdminPayrollPage: NextPage = () => {
  const { user, isLoading } = useAdmin();

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

export default withAdminAuth(AdminPayrollPage);
