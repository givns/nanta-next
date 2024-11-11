// pages/admin/approvals/index.tsx
import React from 'react';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { NextPage } from 'next';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const ApprovalAdminDashboard = dynamic(
  () => import('@/components/admin/approvals/ApprovalDashboard'),
  {
    ssr: false,
    loading: () => <DashboardSkeleton />,
  },
);

const ApprovalDashboard: NextPage = () => {
  const { user, isLoading, isAuthorized } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  if (isLoading || !user) {
    return <DashboardSkeleton />;
  }

  if (!isAuthorized) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            คุณไม่มีสิทธิ์ในการเข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ
          </AlertDescription>
        </Alert>
      </div>
    );
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
