// pages/payroll/index.tsx
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PayrollPeriodManagement from '@/components/payroll/PayrollPeriodManagement';
import PayrollProcessing from '@/components/payroll/PayrollProcessing';
import PayrollSettings from '@/components/payroll/PayrollSettings';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { useAuth } from '@/hooks/useAuth';

export default function PayrollManagement() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user || !['Admin', 'SuperAdmin'].includes(user.role)) {
    return <div>Unauthorized</div>;
  }

  return (
    <AdminLayout>
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Payroll Management</h1>

        <Tabs defaultValue="periods" className="space-y-4">
          <TabsList>
            <TabsTrigger value="periods">Payroll Periods</TabsTrigger>
            <TabsTrigger value="processing">Process Payroll</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="periods">
            <PayrollPeriodManagement />
          </TabsContent>

          <TabsContent value="processing">
            <PayrollProcessing />
          </TabsContent>

          <TabsContent value="settings">
            <PayrollSettings />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
