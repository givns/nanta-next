// pages/user-dashboard.tsx
import { useState, useEffect } from 'react';
import { UserDashboard as DashboardComponent } from '@/components/dashboard/UserDashboard';
import { DashboardData } from '@/types/dashboard';
import { DashboardResponse } from '@/types/api';
import LoadingBar from '@/components/LoadingBar';
import axios from 'axios';
import { getCachedUserData, fetchUserData } from '@/services/userService';
import { isDashboardData } from '@/types/dashboard';

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
        const response = await axios.get(
          `/api/dashboard?lineUserId=${lineUserId}`,
        );

        if (response.data?.data) {
          // Pass data to handleDashboardData for safe processing
          handleDashboardData(response.data.data);

          // Set the processed data
          setDashboardData(response.data.data);
          setError(null);
        } else {
          console.error('Invalid response structure:', response.data);
          throw new Error('Invalid dashboard data structure');
        }
      } catch (error: any) {
        setError(error.message || 'Failed to fetch dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [lineUserId]);

  // Add the handleDashboardData function here for safe access of API data
  const handleDashboardData = (data: any) => {
    const overtimeEntries: any[] = data.overtimeEntries || [];
    overtimeEntries.forEach((entry: any) => {
      console.log('Overtime entry:', entry);
    });
  };

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
