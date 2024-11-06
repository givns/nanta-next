// pages/admin/attendance/daily.tsx
import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import DailyAttendanceView from '@/components/admin/attendance/DailyAttendanceView';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function DailyAttendancePage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Daily Attendance</h1>
          <p className="text-gray-500">
            {format(new Date(), 'EEEE, d MMMM yyyy', { locale: th })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline">Export Report</Button>
        </div>
      </div>

      <DailyAttendanceView />
    </div>
  );
}
