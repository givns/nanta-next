import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { UserData } from '../types/user';
import { AttendanceStatusInfo, ShiftData } from '@/types/attendance';
import axios from 'axios';
import liff from '@line/liff';
import { format } from 'date-fns';
import SkeletonLoader from '../components/SkeletonLoader';
// Lazy load components
const CheckInOutForm = dynamic(() => import('../components/CheckInOutForm'), {
  loading: () => <p>Loading form...</p>,
});
const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

const CheckInRouter: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo | null>(null);
  const [effectiveShift, setEffectiveShift] = useState<ShiftData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(
    format(new Date(), 'HH:mm:ss'),
  );

  useEffect(() => {
    const initializeLiffAndFetchData = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          throw new Error('LIFF ID is not defined');
        }

        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const response = await axios.get(
          `/api/user-check-in-status?lineUserId=${profile.userId}`,
        );

        const { user, attendanceStatus, effectiveShift } = response.data;

        setUserData(user);
        setAttendanceStatus(attendanceStatus);
        setEffectiveShift(effectiveShift);
      } catch (err) {
        console.error('Error in initialization or data fetching:', err);
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred',
        );
      } finally {
        setIsLoading(false);
      }
    };

    initializeLiffAndFetchData();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(format(new Date(), 'HH:mm:ss')); // Add timeZone property to format options
    }, 1000); // Update every second

    return () => clearInterval(intervalId);
  }, []);

  if (isLoading) {
    return <SkeletonLoader />; // Show skeleton while loading
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">เกิดข้อผิดพลาด</h1>
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => liff.login()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
        >
          เข้าสู่ระบบอีกครั้ง
        </button>
      </div>
    );
  }

  if (!userData || !attendanceStatus || !effectiveShift) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">ไม่พบข้อมูลผู้ใช้</h1>
        <button
          onClick={() => liff.login()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
        >
          เข้าสู่ระบบอีกครั้ง
        </button>
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
        <div className="w-full max-w-md">
          <CheckInOutForm
            userData={userData}
            initialAttendanceStatus={attendanceStatus}
            effectiveShift={effectiveShift}
            onStatusChange={(newStatus) =>
              setAttendanceStatus((prev) =>
                prev ? { ...prev, isCheckingIn: newStatus } : null,
              )
            }
          />
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default CheckInRouter;
