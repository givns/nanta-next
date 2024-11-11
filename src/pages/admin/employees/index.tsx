import Head from 'next/head';
import dynamic from 'next/dynamic';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { useAdmin } from '@/contexts/AdminContext';
import { NextPage } from 'next';

const EmployeeManagementDashboard = dynamic(
  () => import('@/components/admin/employees/EmployeeManagementDashboard'),
  {
    loading: () => <DashboardSkeleton />,
    ssr: false,
  },
);

const AdminEmployeesPage: NextPage = () => {
  const { user, isLoading } = useAdmin();

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
