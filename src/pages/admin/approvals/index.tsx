// pages/admin/approvals/index.tsx
import React from 'react';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { NextPage } from 'next';
import { withAdminAuth } from '@/utils/withAdminAuth';
import dynamic from 'next/dynamic';
import { useAdmin } from '@/contexts/AdminContext';

const ApprovalAdminDashboard = dynamic(
  () => import('@/components/admin/approvals/ApprovalDashboard'),
  {
    ssr: false,
    loading: () => <DashboardSkeleton />,
  },
);

const ApprovalDashboard: NextPage = () => {
  const { user, isLoading } = useAdmin();

  if (isLoading || !user) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Approval Dashboard</h1>
        <p className="text-gray-500">
          Manage all pending approvals and requests
        </p>
      </div>
      <ApprovalAdminDashboard />
    </div>
  );
};
export default ApprovalDashboard;
