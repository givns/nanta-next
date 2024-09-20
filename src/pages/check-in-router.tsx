// check-in-router.tsx

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { UserData } from '../types/user';
import { AttendanceStatusInfo, ShiftData } from '@/types/attendance';
import axios from 'axios';
import { formatBangkokTime, getBangkokTime } from '../utils/dateUtils';
import SkeletonLoader from '../components/SkeletonLoader';
import { SpeedInsights } from '@vercel/speed-insights/next';

const CheckInOutForm = dynamic(() => import('../components/CheckInOutForm'), {
  loading: () => <p>Loading form...</p>,
});
const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

interface CheckInRouterProps {
  lineUserId: string | null;
}

const CACHE_KEY = 'attendanceStatus';
const CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes in milliseconds

interface CachedData {
  data: {
    userData: UserData;
    attendanceStatus: AttendanceStatusInfo;
    effectiveShift: ShiftData;
    checkInOutAllowance: {
      allowed: boolean;
      reason?: string;
      isLate?: boolean;
      isOvertime?: boolean;
    };
  };
  timestamp: number;
}

const CheckInRouter: React.FC<CheckInRouterProps> = ({ lineUserId }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo | null>(null);
  const [effectiveShift, setEffectiveShift] = useState<ShiftData | null>(null);
  const [checkInOutAllowance, setCheckInOutAllowance] = useState<{
    allowed: boolean;
    reason?: string;
    isLate?: boolean;
    isOvertime?: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(
    getBangkokTime().toLocaleTimeString(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isCachedData, setIsCachedData] = useState(false);

  const getCachedData = (): CachedData | null => {
    const cachedString = localStorage.getItem(CACHE_KEY);
    if (!cachedString) return null;
    return JSON.parse(cachedString);
  };

  const setCachedData = (data: CachedData['data']) => {
    const cacheData: CachedData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  };

  const isCacheValid = (cachedData: CachedData): boolean => {
    return Date.now() - cachedData.timestamp < CACHE_EXPIRATION;
  };

  const invalidateCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    setIsCachedData(false);
    console.log('Cache invalidated');
  }, []);

  const fetchData = useCallback(async () => {
    if (!lineUserId) {
      setError('LINE user ID not available');
      setIsLoading(false);
      return;
    }

    try {
      const cachedData = getCachedData();
      if (cachedData && isCacheValid(cachedData)) {
        console.log('Cache hit');
        const {
          userData,
          attendanceStatus,
          effectiveShift,
          checkInOutAllowance,
        } = cachedData.data;
        setUserData(userData);
        setAttendanceStatus(attendanceStatus);
        setEffectiveShift(effectiveShift);
        setCheckInOutAllowance(checkInOutAllowance);
        setIsLoading(false);
        setIsCachedData(true);
        return;
      }

      console.log('Cache miss');
      const response = await axios.get(
        `/api/user-check-in-status?lineUserId=${lineUserId}`,
      );
      const {
        user,
        attendanceStatus: fetchedAttendanceStatus,
        effectiveShift: fetchedEffectiveShift,
        checkInOutAllowance: fetchedAllowance,
      } = response.data;

      setUserData(user);
      setAttendanceStatus(fetchedAttendanceStatus);
      setEffectiveShift(fetchedEffectiveShift);
      setCheckInOutAllowance(fetchedAllowance);

      setCachedData({
        userData: user,
        attendanceStatus: fetchedAttendanceStatus,
        effectiveShift: fetchedEffectiveShift,
        checkInOutAllowance: fetchedAllowance,
      });
      setIsCachedData(false);
    } catch (err) {
      console.error('Error in data fetching:', err);
      setError(
        err instanceof Error ? err.message : 'An unknown error occurred',
      );
      invalidateCache();
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId, invalidateCache]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const updateTime = () => {
      try {
        setCurrentTime(getBangkokTime().toLocaleTimeString());
      } catch (err) {
        console.error('Error updating time:', err);
      }
    };

    updateTime();
    const intervalId = setInterval(updateTime, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleStatusChange = useCallback(
    async (newStatus: boolean) => {
      if (attendanceStatus) {
        try {
          const response = await axios.post('/api/check-in-out', {
            lineUserId,
            isCheckIn: newStatus,
          });

          const updatedStatus = response.data;
          setAttendanceStatus(updatedStatus);

          // Update cache
          const cachedData = getCachedData();
          if (cachedData) {
            cachedData.data.attendanceStatus = updatedStatus;
            setCachedData(cachedData.data);
          }

          setIsCachedData(false);
        } catch (error) {
          console.error('Error during check-in/out:', error);
          invalidateCache();
        }
      }
      await fetchData(); // Refresh data after status change
    },
    [attendanceStatus, fetchData, invalidateCache, lineUserId],
  );

  if (isLoading) {
    return <SkeletonLoader />;
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">เกิดข้อผิดพลาด</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!userData || !attendanceStatus || !effectiveShift) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">
          ไม่พบข้อมูลผู้ใช้หรือข้อมูลกะงาน
        </h1>
        <pre>
          {JSON.stringify(
            { userData, attendanceStatus, effectiveShift },
            null,
            2,
          )}
        </pre>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="main-container flex flex-col min-h-screen bg-gray-100 p-4">
        <div className="flex-grow flex flex-col justify-start items-center"></div>
        <h1 className="text-2xl font-bold text-center mt-8 mb-2 text-gray-800">
          {attendanceStatus.isCheckingIn
            ? 'ระบบบันทึกเวลาเข้างาน'
            : 'ระบบบันทึกเวลาออกงาน'}
        </h1>
        <div className="text-3xl font-bold text-center mb-2 text-black-950">
          {currentTime}
        </div>
        {isCachedData && (
          <div className="text-sm text-gray-500 text-center mb-2">
            Viewing cached data.{' '}
            <button onClick={fetchData} className="text-blue-500 underline">
              Refresh
            </button>
          </div>
        )}
        {formError && (
          <div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
            role="alert"
          >
            <strong className="font-bold">Error in CheckInOutForm:</strong>
            <span className="block sm:inline"> {formError}</span>
          </div>
        )}
        <ErrorBoundary
          onError={(error: Error) => {
            console.error('Error in CheckInOutForm:', error);
            setFormError(error.message);
            invalidateCache();
          }}
        >
          <div className="w-full max-w-md">
            <CheckInOutForm
              userData={userData}
              initialAttendanceStatus={attendanceStatus}
              effectiveShift={effectiveShift}
              initialCheckInOutAllowance={checkInOutAllowance}
              onStatusChange={handleStatusChange}
              onError={invalidateCache}
            />
          </div>
          <SpeedInsights />
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  );
};

export default CheckInRouter;
