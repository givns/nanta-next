import Head from 'next/head';
import dynamic from 'next/dynamic';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { useAdmin } from '@/contexts/AdminContext';

const EmployeeManagementDashboard = dynamic(
  () => import('@/components/admin/employees/EmployeeManagementDashboard'),
  {
    loading: () => <DashboardSkeleton />,
    ssr: false,
  },
);

export default function AdminEmployeesPage() {
  const { user, isLoading } = useAdmin();

  // Handle SSR and loading states
  if (typeof window === 'undefined' || isLoading || !user) {
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
}

// Add getServerSideProps to ensure server-side rendering
export async function getServerSideProps() {
  return {
    props: {},
  };
}
