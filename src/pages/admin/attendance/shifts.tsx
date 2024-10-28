// pages/admin/attendance/shifts.tsx
import React from 'react';
import { Card } from '@/components/ui/card';
import ShiftAdjustmentDashboard from '@/components/admin/attendance/ShiftAdjustmentDashboard';
import BulkShiftAssignment from '@/components/admin/attendance/BulkShiftAssignment';
import ShiftPatternManagement from '@/components/admin/attendance/ShiftPatternManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ShiftsPage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Shift Management</h1>
        <p className="text-gray-500">
          Manage employee shift assignments and patterns
        </p>
      </div>

      <Tabs defaultValue="adjustments">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="adjustments">Shift Adjustments</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Assignment</TabsTrigger>
          <TabsTrigger value="patterns">Shift Patterns</TabsTrigger>
        </TabsList>

        <TabsContent value="adjustments">
          <ShiftAdjustmentDashboard />
        </TabsContent>

        <TabsContent value="bulk">
          <BulkShiftAssignment />
        </TabsContent>

        <TabsContent value="patterns">
          <ShiftPatternManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
