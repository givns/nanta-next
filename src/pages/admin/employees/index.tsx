// pages/admin/employees/index.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { useAuth } from '@/hooks/useAuth';

const EmployeeManagementDashboard = dynamic(
  () => import('@/components/admin/EmployeeManagementDashboard'),
  {
    loading: () => <DashboardSkeleton />,
    ssr: false,
  },
);

export default function AdminEmployeePage() {
  const { user, isLoading, isAuthorized } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!isAuthorized) {
    return null;
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
