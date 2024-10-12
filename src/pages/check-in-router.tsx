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

const CheckInOutForm = dynamic(() => import('../components/CheckInOutForm'), {
  loading: () => <p>ระบบกำลังตรวจสอบข้อมูลผู้ใช้งาน...</p>,
  ssr: false,
});

interface CheckInRouterProps {
  lineUserId: string | null;
}

const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

const CheckInRouter: React.FC<CheckInRouterProps> = ({ lineUserId }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    attendanceStatus: liveAttendanceStatus,
    effectiveShift,
    isLoading: isAttendanceLoading,
    error: attendanceError,
    checkInOutAllowance,
    refreshAttendanceStatus,
    checkInOut,
    location,
    address,
  } = useSimpleAttendance(
    userData?.employeeId,
    lineUserId,
    cachedAttendanceStatus,
  );

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
            location: `${location.lat},${location.lng}`,
            reason: '',
          });
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
    [userData, location, checkInOut, address],
  );

  const handleCloseWindow = useCallback(() => {
    closeWindow();
  }, []);

  const memoizedCheckInOutForm = useMemo(
    () => (
      <CheckInOutForm
        userData={userData!}
        cachedAttendanceStatus={cachedAttendanceStatus}
        liveAttendanceStatus={liveAttendanceStatus}
        effectiveShift={effectiveShift}
        isAttendanceLoading={isAttendanceLoading}
        checkInOutAllowance={checkInOutAllowance}
        refreshAttendanceStatus={refreshAttendanceStatus}
        onStatusChange={handleStatusChange}
        onCloseWindow={handleCloseWindow}
      />
    ),
    [
      userData,
      cachedAttendanceStatus,
      liveAttendanceStatus,
      effectiveShift,
      isAttendanceLoading,
      checkInOutAllowance,
      refreshAttendanceStatus,
      handleStatusChange,
      handleCloseWindow,
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

  return (
    <ErrorBoundary>
      <div className="main-container flex flex-col min-h-screen bg-gray-100 p-4">
        <div className="flex-grow flex flex-col justify-start items-center">
          <h1 className="text-2xl font-bold text-center mt-8 mb-2 text-gray-800">
            {liveAttendanceStatus?.isCheckingIn
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
            <div className="w-full max-w-md">
              {userData && memoizedCheckInOutForm}
            </div>
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInRouter);
