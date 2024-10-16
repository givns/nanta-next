import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { UserData } from '../types/user';
import { AttendanceStatusInfo } from '@/types/attendance';
import Clock from '../components/Clock';
import { closeWindow } from '../services/liff';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import {
  fetchUserData,
  getCachedUserData,
  getCachedAttendanceStatus,
} from '../services/userService';
import { getCurrentTime } from '@/utils/dateUtils';

const CheckInOutForm = dynamic(() => import('../components/CheckInOutForm'), {
  loading: () => <p>ระบบกำลังตรวจสอบข้อมูลผู้ใช้งาน...</p>,
  ssr: false,
});

const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

interface CheckInRouterProps {
  lineUserId: string | null;
}

const CheckInRouter: React.FC<CheckInRouterProps> = ({ lineUserId }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [cachedAttendanceStatus, setCachedAttendanceStatus] =
    useState<AttendanceStatusInfo | null>(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!lineUserId) {
        setError('LINE User ID not available');
        setIsLoading(false);
        return;
      }

      try {
        const cachedUser = await getCachedUserData(lineUserId);
        const cachedStatus = await getCachedAttendanceStatus(lineUserId);

        if (cachedUser && cachedStatus) {
          setUserData(cachedUser);
          setCachedAttendanceStatus(cachedStatus);
        } else {
          const fetchedUser = await fetchUserData(lineUserId);
          setUserData(fetchedUser);
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setError('Failed to fetch initial data');
      } finally {
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
    inPremises,
    address,
    checkInOutAllowance,
    refreshAttendanceStatus,
    checkInOut,
    getCurrentLocation,
  } = useSimpleAttendance(
    userData?.employeeId,
    lineUserId,
    cachedAttendanceStatus,
  );

  const handleStatusChange = useCallback(
    async (
      newStatus: boolean,
      photo?: string,
      lateReason?: string,
      isLate?: boolean,
      isOvertime?: boolean,
    ) => {
      console.log('handleStatusChange called with:', {
        newStatus,
        photo,
        lateReason,
        isLate,
        isOvertime,
      });
      console.log('Current userData:', userData);
      console.log('Current checkInOutAllowance:', checkInOutAllowance);
      console.log('Current address:', address);

      if (!userData) {
        const error = new Error('User data is missing. Please try again.');
        console.error(error);
        setFormError(error.message);
        throw error;
      }

      if (!checkInOutAllowance) {
        const error = new Error(
          'Check-in/out allowance data is missing. Please try again.',
        );
        console.error(error);
        setFormError(error.message);
        throw error;
      }

      if (!address) {
        const error = new Error('Address is missing. Please try again.');
        console.error(error);
        setFormError(error.message);
        throw error;
      }
      try {
        // Get the server time first
        const serverTimeResponse = await fetch('/api/server-time');
        const { serverTime } = await serverTimeResponse.json();

        const checkInOutData = {
          employeeId: userData.employeeId,
          lineUserId: userData.lineUserId,
          isCheckIn: newStatus,
          checkTime: serverTime,
          checkInAddress: newStatus ? address : undefined,
          checkOutAddress: !newStatus ? address : undefined,
          reason: lateReason || '',
          photo: photo,
          isLate: isLate || false,
          isOvertime: isOvertime || false,
        };

        console.log('Calling checkInOut with data:', checkInOutData);
        await checkInOut(checkInOutData);

        console.log('checkInOut successful, refreshing attendance status');
        await refreshAttendanceStatus(true);
      } catch (error: any) {
        console.error('Error during check-in/out:', error);
        setFormError(
          `Failed to update status. ${error.response?.data?.error || error.message}`,
        );
        throw error; // Rethrow the error to be caught in the CheckInOutForm
      }
    },
    [
      userData,
      checkInOutAllowance,
      address,
      checkInOut,
      refreshAttendanceStatus,
    ],
  );

  const handleCloseWindow = useCallback(() => {
    closeWindow();
  }, []);

  const memoizedCheckInOutForm = useMemo(
    () =>
      userData ? (
        <CheckInOutForm
          userData={userData}
          cachedAttendanceStatus={cachedAttendanceStatus}
          liveAttendanceStatus={attendanceStatus}
          isCheckingIn={attendanceStatus?.isCheckingIn ?? true}
          effectiveShift={effectiveShift}
          isAttendanceLoading={isAttendanceLoading}
          checkInOutAllowance={checkInOutAllowance}
          getCurrentLocation={getCurrentLocation}
          refreshAttendanceStatus={refreshAttendanceStatus}
          onStatusChange={handleStatusChange}
          onCloseWindow={handleCloseWindow}
        />
      ) : null,
    [
      userData,
      cachedAttendanceStatus,
      attendanceStatus,
      effectiveShift,
      isAttendanceLoading,
      checkInOutAllowance,
      refreshAttendanceStatus,
      handleStatusChange,
      handleCloseWindow,
    ],
  );

  const isDataReady = userData && checkInOutAllowance && !isAttendanceLoading;

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

  return (
    <ErrorBoundary>
      <div className="main-container flex flex-col min-h-screen bg-gray-100 p-4">
        <div className="flex-grow flex flex-col justify-start items-center">
          <h1 className="text-2xl font-bold text-center mt-8 mb-2 text-gray-800">
            {attendanceStatus?.isCheckingIn
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
          {!inPremises && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mt-4">
              <span className="block sm:inline">คุณอยู่นอกสถานที่ทำงาน</span>
              <button
                onClick={getCurrentLocation}
                className="mt-2 bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-1 px-2 rounded text-sm"
              >
                ตรวจสอบตำแหน่งอีกครั้ง
              </button>
            </div>
          )}
          <ErrorBoundary
            onError={(error: Error) => {
              console.error('Error in CheckInOutForm:', error);
              setFormError(error.message);
            }}
          >
            <div className="w-full max-w-md">
              {isDataReady ? (
                userData && memoizedCheckInOutForm
              ) : (
                <div>Loading necessary data...</div>
              )}
            </div>
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInRouter);
