import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OvertimeDashboard from '../components/OvertimeDashboard';
import AdminShiftAdjustmentForm from '../components/AdminShiftAdjustmentForm';
import NoWorkDayManagement from '../components/NoWorkDayManagement';
import { User } from '@prisma/client';

interface AdminDashboardProps {
  userData: User;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ userData }) => {
  const [activeTab, setActiveTab] = useState('overtime');

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overtime">Approve Overtime</TabsTrigger>
          <TabsTrigger value="shift">Adjust Shift</TabsTrigger>
          <TabsTrigger value="noworkday">No Work Day Management</TabsTrigger>
        </TabsList>
        <TabsContent value="overtime">
          <OvertimeDashboard
            employeeId={userData.employeeId}
            userRole={userData.role}
            userDepartmentId={userData.departmentId ?? ''}
          />
        </TabsContent>
        <TabsContent value="shift">
          <AdminShiftAdjustmentForm
            lineUserId={userData.lineUserId ?? undefined}
          />
        </TabsContent>
        <TabsContent value="noworkday">
          <NoWorkDayManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
