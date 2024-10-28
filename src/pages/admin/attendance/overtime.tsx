// pages/admin/attendance/overtime.tsx
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OvertimeRequests from '@/components/admin/attendance/overtime/OvertimeRequests';
import OvertimeSettings from '@/components/admin/attendance/overtime/OvertimeSettings';
import OvertimeReports from '@/components/admin/attendance/overtime/OvertimeReports';

export default function OvertimePage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Overtime Management</h1>
        <p className="text-gray-500">Manage overtime requests and policies</p>
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="requests">Overtime Requests</TabsTrigger>
          <TabsTrigger value="settings">Policies & Settings</TabsTrigger>
          <TabsTrigger value="reports">Reports & Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <OvertimeRequests />
        </TabsContent>

        <TabsContent value="settings">
          <OvertimeSettings />
        </TabsContent>

        <TabsContent value="reports">
          <OvertimeReports />
        </TabsContent>
      </Tabs>
    </div>
  );
}
