import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApprovalDashboard from '../components/ApprovalDashboard';
import AdminShiftAdjustmentForm from '../components/AdminShiftAdjustmentForm';
import NoWorkDayManagement from '../components/NoWorkDayManagement';

interface ConsolidatedApprovalDashboardProps {
  userData: {
    employeeId: string;
    role: string;
    departmentId: string;
    lineUserId: string;
  };
}

const ConsolidatedApprovalDashboard: React.FC<
  ConsolidatedApprovalDashboardProps
> = ({ userData }) => {
  const [activeTab, setActiveTab] = useState('approvals');

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Administrative Dashboard</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="shiftAdjustment">Shift Adjustment</TabsTrigger>
          <TabsTrigger value="noWorkDay">No Work Day Management</TabsTrigger>
        </TabsList>
        <TabsContent value="approvals">
          <ApprovalDashboard />
        </TabsContent>
        <TabsContent value="shiftAdjustment">
          <AdminShiftAdjustmentForm lineUserId={userData.lineUserId} />
        </TabsContent>
        <TabsContent value="noWorkDay">
          <NoWorkDayManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConsolidatedApprovalDashboard;
