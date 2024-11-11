// pages/admin/attendance/daily.tsx
import React, { useState, useEffect } from 'react';
import { format, startOfDay } from 'date-fns';
import { th } from 'date-fns/locale/th';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileSpreadsheet, Download } from 'lucide-react';
import Head from 'next/head';
import { useToast } from '@/components/ui/use-toast';
import { useAdmin } from '@/contexts/AdminContext';

// Loading placeholder for better UX during dynamic import
const LoadingPlaceholder = () => (
  <Card className="p-6">
    <div className="space-y-6">
      {/* Summary Stats Loading */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-lg p-4">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Filters Loading */}
      <div className="flex flex-col md:flex-row gap-4">
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-10 flex-1" />
      </div>

      {/* Table Loading */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  </Card>
);

// Dynamically import the DailyAttendanceView component
const DailyAttendanceView = dynamic(
  () => import('@/components/admin/attendance/DailyAttendanceView'),
  {
    loading: () => <LoadingPlaceholder />,
    ssr: false, // Keep this to avoid hydration issues
  },
);

export default function DailyAttendancePage() {
  const { toast } = useToast();
  const { user, isLoading: isAdminLoading } = useAdmin();
  const [mounted, setMounted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Wait for client-side hydration to complete
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle export functionality
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const currentDate = format(new Date(), 'yyyy-MM-dd');

      const response = await fetch('/api/admin/attendance/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          date: currentDate,
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${currentDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export Successful',
        description: 'Attendance report has been downloaded',
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: 'There was an error exporting the attendance report',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Show loading placeholder until mounted and admin data is loaded
  if (!mounted || isAdminLoading) {
    return <LoadingPlaceholder />;
  }

  return (
    <>
      <Head>
        <title>Daily Attendance - Admin Dashboard</title>
      </Head>

      <div className="space-y-6 p-4 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Daily Attendance</h1>
            <p className="text-gray-500">
              {format(new Date(), 'EEEE, d MMMM yyyy', { locale: th })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
              className="w-full md:w-auto"
            >
              {isExporting ? (
                <>
                  <Download className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Export Report
                </>
              )}
            </Button>
          </div>
        </div>

        <DailyAttendanceView key={mounted.toString()} />
      </div>
    </>
  );
}

// Add getServerSideProps to ensure server-side rendering
export async function getServerSideProps() {
  return {
    props: {},
  };
}
