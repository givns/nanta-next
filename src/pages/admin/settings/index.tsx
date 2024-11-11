// pages/admin/settings/index.tsx
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PayrollSettings from '@/components/admin/settings/PayrollSettings';
import AttendanceSettings from '@/components/admin/settings/AttendanceSettings';
import LeaveSettings from '@/components/admin/settings/LeaveSettings';
import { useAuth } from '@/hooks/useAuth';

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState('payroll');
  const { user, isLoading } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">System Settings</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="payroll">Payroll Settings</TabsTrigger>
          <TabsTrigger value="attendance">Attendance Rules</TabsTrigger>
          <TabsTrigger value="leave">Leave Policies</TabsTrigger>
          <TabsTrigger value="company">Company Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll">
          <PayrollSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
