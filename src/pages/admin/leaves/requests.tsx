// pages/admin/leaves/requests.tsx
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LeaveRequests from '@/components/admin/leaves/LeaveRequests';
import LeaveBalances from '@/components/admin/leaves/LeaveBalances';
import LeaveSettings from '@/components/admin/leaves/LeaveSettings';

export default function LeavePage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Leave Management</h1>
        <p className="text-gray-500">
          Manage employee leave requests and balances
        </p>
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="requests">Leave Requests</TabsTrigger>
          <TabsTrigger value="balances">Leave Balances</TabsTrigger>
          <TabsTrigger value="settings">Leave Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <LeaveRequests />
        </TabsContent>

        <TabsContent value="balances">
          <LeaveBalances />
        </TabsContent>

        <TabsContent value="settings">
          <LeaveSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
