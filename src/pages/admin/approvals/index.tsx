// pages/admin/approvals/index.tsx
import React from 'react';
import ApprovalDashboard from '@/components/admin/approvals/ApprovalDashboard';
import PendingSummary from '@/components/admin/approvals/PendingSummary';

export default function ApprovalsPage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Approval Dashboard</h1>
        <p className="text-gray-500">
          Manage all pending approvals and requests
        </p>
      </div>
      <PendingSummary />
      <ApprovalDashboard />
    </div>
  );
}
