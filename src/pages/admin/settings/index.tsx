// pages/admin/settings/index.tsx
import { useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PayrollSettings from '@/components/admin/settings/PayrollSettings';
import AttendanceSettings from '@/components/admin/settings/AttendanceSettings';
import LeaveSettings from '@/components/admin/settings/LeaveSettings';

export default function AdminSettingsPage() {
  const { user } = useAdmin();
  const [activeTab, setActiveTab] = useState('payroll');

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
