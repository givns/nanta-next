// pages/check-in-router.tsx

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { UserData } from '../types/user';
import { AttendanceStatusInfo, ShiftData } from '@/types/attendance';
import axios from 'axios';
import { formatBangkokTime, getBangkokTime } from '../utils/dateUtils';
import SkeletonLoader from '../components/SkeletonLoader';

const CheckInOutForm = dynamic(() => import('../components/CheckInOutForm'), {
  loading: () => <p>Loading form...</p>,
});
const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

interface CheckInRouterProps {
  lineUserId: string | null;
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
    new Date().toLocaleTimeString(),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!lineUserId) {
      setError('LINE user ID not available');
      setIsLoading(false);
      return;
    }

    try {
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
    } catch (err) {
      console.error('Error in data fetching:', err);
      setError(
        err instanceof Error ? err.message : 'An unknown error occurred',
      );
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        setCurrentTime(now.toLocaleTimeString());
      } catch (err) {
        console.error('Error updating time:', err);
      }
    };

    updateTime(); // Initial update
    const intervalId = setInterval(updateTime, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleStatusChange = useCallback(
    (newStatus: boolean) => {
      setAttendanceStatus((prev) =>
        prev ? { ...prev, isCheckingIn: newStatus } : null,
      );
      fetchData(); // Refresh data after status change
    },
    [fetchData],
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
          }}
        >
          <div className="w-full max-w-md">
            <CheckInOutForm
              userData={userData}
              initialAttendanceStatus={attendanceStatus}
              effectiveShift={effectiveShift}
              initialCheckInOutAllowance={checkInOutAllowance}
              onStatusChange={handleStatusChange}
            />
          </div>
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  );
};

export default CheckInRouter;
