// check-in-router.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { UserData } from '../types/user';
import axios from 'axios';
import { z } from 'zod'; // Import Zod for runtime type checking
import {
  UserDataSchema,
  ResponseDataSchema,
  parseUserData,
} from '../schemas/attendance'; // Adjust the import path as needed
import Clock from '../components/Clock';
import { closeWindow } from '../services/liff';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { AttendanceStatusInfo } from '@/types/attendance';

const CheckInOutForm = dynamic(
  () =>
    import('../components/CheckInOutForm').then((module) => {
      console.log('CheckInOutForm module loaded successfully', module);
      return module.default;
    }),
  {
    loading: () => <p>ระบบกำลังตรวจสอบข้อมูลผู้ใช้งาน...</p>,
    ssr: false,
  },
);

const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

interface CheckInRouterProps {
  lineUserId: string | null;
}

const CheckInRouter: React.FC<CheckInRouterProps> = ({ lineUserId }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialAttendanceStatus, setInitialAttendanceStatus] =
    useState<AttendanceStatusInfo | null>(null);

  const handleCloseWindow = useCallback(() => {
    closeWindow();
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!lineUserId) {
        setError('LINE User ID not available');
        setIsLoading(false);
        return;
      }

      try {
        const userResponse = await axios.get(
          `/api/user-data?lineUserId=${lineUserId}`,
        );
        const parsedUserData = UserDataSchema.parse(userResponse.data.user);
        setUserData(parseUserData(parsedUserData));
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setError('Failed to fetch initial data');
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [lineUserId]);

  const {
    attendanceStatus,
    effectiveShift,
    isLoading: isAttendanceLoading,
    error: attendanceError,
    location,
    address,
    checkInOutAllowance,
    checkInOut,
    refreshAttendanceStatus,
  } = useSimpleAttendance(
    userData?.employeeId,
    lineUserId,
    initialAttendanceStatus,
  );

  console.log('useSimpleAttendance result:', {
    attendanceStatus,
    effectiveShift,
  });

  useEffect(() => {
    console.log('Effect in check-in-router - effectiveShift:', effectiveShift);
  }, [effectiveShift]);

  const handleStatusChange = useCallback(
    async (newStatus: boolean) => {
      if (userData && location) {
        try {
          await checkInOut({
            employeeId: userData.employeeId,
            lineUserId: userData.lineUserId,
            isCheckIn: newStatus,
            checkTime: new Date().toISOString(),
            checkInAddress: newStatus ? address : undefined,
            checkOutAddress: !newStatus ? address : undefined,
          });
          await refreshAttendanceStatus(true);
        } catch (error: any) {
          console.error('Error during check-in/out:', error);
          setFormError(
            `Failed to update status. ${error.response?.data?.error || error.message}`,
          );
        }
      } else {
        setFormError('Missing data for check-in/out. Please try again.');
      }
    },
    [userData, location, checkInOut, refreshAttendanceStatus, address],
  );

  const memoizedCheckInOutForm = useMemo(
    () => (
      <CheckInOutForm
        onCloseWindow={handleCloseWindow}
        userData={userData!}
        initialAttendanceStatus={attendanceStatus}
        effectiveShift={effectiveShift || null} // Add null check here
        onStatusChange={handleStatusChange}
        onError={() => refreshAttendanceStatus(true)}
        isActionButtonReady={!isAttendanceLoading}
        checkInOutAllowance={checkInOutAllowance}
        isCheckingIn={attendanceStatus?.isCheckingIn}
      />
    ),
    [
      handleCloseWindow,
      userData,
      attendanceStatus,
      effectiveShift,
      handleStatusChange,
      refreshAttendanceStatus,
      isAttendanceLoading,
      checkInOutAllowance,
    ],
  );

  if (isLoading || isAttendanceLoading) {
    return <div>Loading...</div>;
  }

  if (error || attendanceError) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">เกิดข้อผิดพลาด</h1>
        <p className="text-red-500">{error || attendanceError}</p>
      </div>
    );
  }

  if (!userData || !attendanceStatus) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">ไม่พบข้อมูลผู้ใช้</h1>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="main-container flex flex-col min-h-screen bg-gray-100 p-4">
        <div className="flex-grow flex flex-col justify-start items-center">
          <h1 className="text-2xl font-bold text-center mt-8 mb-2 text-gray-800">
            {attendanceStatus.isCheckingIn
              ? 'ระบบบันทึกเวลาเข้างาน'
              : 'ระบบบันทึกเวลาออกงาน'}
          </h1>
          <Clock />
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
            <div className="w-full max-w-md">{memoizedCheckInOutForm}</div>
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInRouter);
