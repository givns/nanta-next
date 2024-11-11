// components/admin/approvals/PendingSummary.tsx
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, Clock, Calendar, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useLiff } from '@/contexts/LiffContext';
import { useAuth } from '@/hooks/useAuth';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SummaryData {
  leaves: number;
  overtime: number;
  urgent: number;
  total: number;
}

export default function PendingSummary() {
  const {
    user,
    isLoading: authLoading,
    isAuthorized,
  } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });
  const { lineUserId } = useLiff();
  const [isLoading, setIsLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<SummaryData>({
    leaves: 0,
    overtime: 0,
    urgent: 0,
    total: 0,
  });

  useEffect(() => {
    if (lineUserId) {
      fetchSummaryData();
    }
  }, [user]);

  const fetchSummaryData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/approvals/summary', {
        headers: {
          'x-line-userid': lineUserId || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch summary data');
      }

      const data = await response.json();
      setSummaryData(data);
    } catch (error) {
      console.error('Error fetching summary data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle loading state
  if (authLoading) {
    return <DashboardSkeleton />;
  }

  // Handle unauthorized access
  if (!isAuthorized || !user) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            คุณไม่มีสิทธิ์ในการเข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const SummaryCard = ({
    title,
    count,
    subtitle,
    icon: Icon,
    iconColor,
    className = '',
  }: {
    title: string;
    count: number;
    subtitle: string;
    icon: any;
    iconColor: string;
    className?: string;
  }) => (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold mt-1">{isLoading ? '-' : count}</p>
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          </div>
          <Icon className={`h-8 w-8 ${iconColor}`} />
        </div>
      </CardContent>
    </Card>
  );

  // Mobile Summary Component
  const MobileSummary = () => (
    <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          <div className="text-2xl font-bold">{summaryData.total}</div>
          <div className="text-sm text-gray-500 flex flex-col justify-center">
            pending
            <br />
            requests
          </div>
        </div>
      </div>

      <Sheet>
        <SheetTrigger asChild>
          <button className="text-sm text-blue-600 hover:text-blue-700">
            View Details
          </button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Pending Summary</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <SummaryCard
              title="Leave Requests"
              count={summaryData.leaves}
              subtitle="Pending approval"
              icon={Calendar}
              iconColor="text-blue-500"
            />
            <SummaryCard
              title="Overtime Requests"
              count={summaryData.overtime}
              subtitle="Awaiting review"
              icon={Clock}
              iconColor="text-orange-500"
            />
            <SummaryCard
              title="Urgent"
              count={summaryData.urgent}
              subtitle="Need immediate attention"
              icon={AlertCircle}
              iconColor="text-red-500"
            />
            <SummaryCard
              title="Total Pending"
              count={summaryData.total}
              subtitle="All requests"
              icon={ClipboardList}
              iconColor="text-purple-500"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );

  // Desktop Summary Grid
  const DesktopSummary = () => (
    <div className="grid grid-cols-4 gap-4">
      <SummaryCard
        title="Leave Requests"
        count={summaryData.leaves}
        subtitle="Pending approval"
        icon={Calendar}
        iconColor="text-blue-500"
      />
      <SummaryCard
        title="Overtime Requests"
        count={summaryData.overtime}
        subtitle="Awaiting review"
        icon={Clock}
        iconColor="text-orange-500"
      />
      <SummaryCard
        title="Urgent"
        count={summaryData.urgent}
        subtitle="Need immediate attention"
        icon={AlertCircle}
        iconColor="text-red-500"
      />
      <SummaryCard
        title="Total Pending"
        count={summaryData.total}
        subtitle="All requests"
        icon={ClipboardList}
        iconColor="text-purple-500"
      />
    </div>
  );

  return (
    <>
      <div className="md:hidden">
        <MobileSummary />
      </div>
      <div className="hidden md:block">
        <DesktopSummary />
      </div>
    </>
  );
}
