// pages/admin/attendance/daily.tsx
import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import dynamic from 'next/dynamic';
import { useAdmin } from '@/contexts/AdminContext';
import Head from 'next/head';

const DailyAttendanceView = dynamic(
  () => import('@/components/admin/attendance/DailyAttendanceView'),
  {
    ssr: false,
    loading: () => <DashboardSkeleton />,
  },
);

export default function DailyAttendancePage() {
  const { user, isLoading } = useAdmin();

  if (isLoading || !user) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      <Head>
        <title>Daily Attendance</title>
      </Head>
      <DailyAttendanceView />
    </>
  );
}
