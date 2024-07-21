// pages/user-dashboard.tsx

import { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Calendar } from '../components/ui/calendar';
import { Input } from '../components/ui/input';
import { UserData, Attendance } from '@/types/user';
import moment from 'moment-timezone';
import liff from '@line/liff';

interface DashboardData {
  user: UserData;
  recentAttendance: Attendance[];
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  overtimeHours: number;
  balanceLeave: number;
}

export default function UserDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        if (!liff.isLoggedIn()) {
          liff.login();
        } else {
          const profile = await liff.getProfile();
          fetchDashboardData(profile.userId);
        }
      } catch (err) {
        console.error('LIFF initialization failed', err);
        setError('Failed to initialize LIFF');
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, []);

  const fetchDashboardData = async (lineUserId: string) => {
    try {
      const response = await fetch(`/api/dashboard?lineUserId=${lineUserId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const data: DashboardData = await response.json();
      setDashboardData(data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError(
        error instanceof Error ? error.message : 'An unknown error occurred',
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!dashboardData) {
    return <div>No dashboard data available.</div>;
  }

  const {
    user,
    recentAttendance,
    totalWorkingDays,
    totalPresent,
    totalAbsent,
    overtimeHours,
    balanceLeave,
  } = dashboardData;
  const latestAttendance = recentAttendance[0];

  return (
    <div className="flex flex-col items-center w-full max-w-md p-4 mx-auto space-y-4 border rounded-md">
      {/* ... (rest of the JSX remains the same) ... */}
    </div>
  );
}
