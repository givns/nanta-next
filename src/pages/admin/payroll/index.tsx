// pages/admin/payroll/index.tsx
import { useAdmin } from '@/contexts/AdminContext';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';

const PayrollAdminDashboard = dynamic(
  () => import('@/components/admin/PayrollAdminDashboard'),
  {
    ssr: false,
    loading: () => <DashboardSkeleton />,
  },
);

export default function AdminPayrollPage() {
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
}
