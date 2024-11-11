import Head from 'next/head';
import dynamic from 'next/dynamic';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { NextPage } from 'next';
import { useAuth } from '@/hooks/useAuth';

const EmployeeManagementDashboard = dynamic(
  () => import('@/components/admin/employees/EmployeeManagementDashboard'),
  {
    loading: () => <DashboardSkeleton />,
    ssr: false,
  },
);

const AdminEmployeesPage: NextPage = () => {
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
        <title>Employee Management - Admin Dashboard</title>
      </Head>
      <EmployeeManagementDashboard />
    </>
  );
};

export default AdminEmployeesPage;

export async function getServerSideProps() {
  return {
    props: {},
  };
}
