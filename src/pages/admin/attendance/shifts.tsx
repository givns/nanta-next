// pages/admin/attendance/shifts.tsx
import React from 'react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ShiftAdjustmentDashboard from '@/components/admin/attendance/ShiftAdjustmentDashboard';
import ShiftPatternManagement from '@/components/admin/attendance/ShiftPatternManagement';
import { LoadingSpinner } from '@/components/LoadingSpinnner';

export default function ShiftsPage() {
  const {
    user,
    isLoading: authLoading,
    isAuthorized,
  } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
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
        <h1 className="text-2xl font-bold">Shift Management</h1>
        <p className="text-gray-500">
          Manage employee shift assignments and patterns
        </p>
      </div>

      <Tabs defaultValue="adjustments">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-2">
          <TabsTrigger value="adjustments">Shift Adjustments</TabsTrigger>
          <TabsTrigger value="patterns">Shift Patterns</TabsTrigger>
        </TabsList>

        <TabsContent value="adjustments">
          <ShiftAdjustmentDashboard />
        </TabsContent>

        <TabsContent value="patterns">
          <ShiftPatternManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
