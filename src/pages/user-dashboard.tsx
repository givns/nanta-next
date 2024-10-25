// pages/user-dashboard.tsx
import { GetServerSideProps } from 'next';
import { withLiff } from '@/utils/auth';
import { UserDashboard as DashboardComponent } from '@/components/dashboard/UserDashboard';
import { DashboardSkeleton } from '@/components/dashboard/UserDashboard';
import { useLiff } from '@/hooks/useLiff';
import {
  DashboardData,
  isDashboardData,
  PayrollPeriodDisplay,
} from '@/types/dashboard';

interface DashboardPageProps {
  initialData?: DashboardData;
  error?: string;
}

export default function DashboardPage({
  initialData,
  error,
}: DashboardPageProps) {
  const { lineUserId, isLoading, error: liffError } = useLiff();

  // Handle errors
  if (error || liffError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {error || liffError}</div>
      </div>
    );
  }

  // Handle loading state
  if (isLoading || !initialData) {
    return <DashboardSkeleton />;
  }

  // Render main dashboard
  return <DashboardComponent initialData={initialData} />;
}

export const getServerSideProps: GetServerSideProps<DashboardPageProps> =
  withLiff(async (context) => {
    try {
      const { lineUserId } = context.query;

      if (!lineUserId || typeof lineUserId !== 'string') {
        throw new Error('No LINE User ID available');
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard?lineUserId=${lineUserId}`,
      );

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const apiData = await response.json();

      // Transform API response to match expected format
      const dashboardData: DashboardData = {
        ...apiData,
        payrollPeriod: {
          startDate: new Date(apiData.payrollPeriod.start),
          endDate: new Date(apiData.payrollPeriod.end),
        },
      };

      // Validate the transformed data
      if (!isDashboardData(dashboardData)) {
        throw new Error('Invalid dashboard data format');
      }

      return {
        props: {
          initialData: dashboardData,
        },
      };
    } catch (error) {
      console.error('Error in getServerSideProps:', error);
      return {
        props: {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch initial data',
        },
      };
    }
  });

export type { DashboardPageProps };
