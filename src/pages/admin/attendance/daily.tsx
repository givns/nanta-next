// pages/admin/attendance/daily.tsx
import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';

const DailyAttendanceView = dynamic(
  () => import('@/components/admin/attendance/DailyAttendanceView'),
  {
    loading: () => (
      <div className="animate-pulse">
        <div className="h-32 bg-gray-200 rounded-lg mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      </div>
    ),
  },
);

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
