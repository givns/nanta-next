// pages/user-dashboard.tsx
import { useState, useEffect } from 'react';
import { UserDashboard as DashboardComponent } from '@/components/dashboard/UserDashboard';
import { DashboardData } from '@/types/dashboard';
import { DashboardResponse } from '@/types/api';
import LoadingBar from '@/components/LoadingBar';
import axios from 'axios';
import { getCachedUserData, fetchUserData } from '@/services/userService';

interface DashboardPageProps {
  lineUserId: string | null;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ lineUserId }) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // No need to check lineUserId here as it's guaranteed by _app.tsx
        const cachedUser = await getCachedUserData(lineUserId!);
        let userData = cachedUser;

        if (!cachedUser) {
          userData = await fetchUserData(lineUserId!);
        }

        if (!userData) {
          throw new Error('Failed to fetch user data');
        }

        const response = await axios.get<DashboardResponse>(
          `/api/dashboard?lineUserId=${lineUserId}`,
        );

        // Add debugging logs
        console.log('Client received response:', {
          hasData: !!response.data,
          hasInnerData: !!response.data?.data,
          innerDataKeys: response.data?.data
            ? Object.keys(response.data.data)
            : [],
        });

        if (!response.data || !response.data.data) {
          console.error('Invalid dashboard response:', response.data);
          throw new Error('No dashboard data received');
        }

        setDashboardData(response.data.data);
        setError(null);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        // Log the full error details
        if (axios.isAxiosError(error)) {
          console.error('Axios error details:', {
            response: error.response?.data,
            status: error.response?.status,
          });
        }
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to fetch dashboard data',
        );
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
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500 mb-4">เกิดข้อผิดพลาด</div>
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>ไม่พบข้อมูล</div>
      </div>
    );
  }

  return <DashboardComponent initialData={dashboardData} />;
};

export default DashboardPage;
