// pages/user-dashboard.tsx
import { useState, useEffect } from 'react';
import { UserDashboard as DashboardComponent } from '@/components/dashboard/UserDashboard';
import { DashboardSkeleton } from '@/components/dashboard/UserDashboard';
import { DashboardData } from '@/types/dashboard';
import LoadingBar from '@/components/LoadingBar';
import axios from 'axios';

interface DashboardPageProps {
  lineUserId: string | null;
}

export default function DashboardPage({ lineUserId }: DashboardPageProps) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!lineUserId) {
        setError('No LINE User ID available');
        setIsLoading(false);
        return;
      }

      try {
        const response = await axios.get<DashboardData>(
          `/api/dashboard?lineUserId=${lineUserId}`,
        );

        if (!response.data) {
          throw new Error('No data received');
        }

        setDashboardData(response.data);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError('Failed to fetch dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [lineUserId]);

  if (isLoading) {
    return <LoadingBar />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>No dashboard data available.</div>
      </div>
    );
  }

  return <DashboardComponent initialData={dashboardData} />;
}
