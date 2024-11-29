import React, { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { UserData } from '@/types/user';
import {
  AttendanceStatusInfo,
  CheckInOutAllowance,
  StatusChangeParams,
  ShiftData,
  PeriodType,
} from '@/types/attendance';
import { CacheManager } from '@/services/CacheManager';
import Clock from '@/components/Clock';
import { closeWindow } from '@/services/liff';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import LoadingBar from '@/components/LoadingBar';
import { useLiff } from '@/contexts/LiffContext';
import { useAuth } from '@/hooks/useAuth';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { getCurrentTime } from '@/utils/dateUtils';

const CheckInOutForm = dynamic(
  () => import('../components/attendance/CheckInOutForm'),
  { ssr: false },
);

const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

const CheckInRouter: React.FC = () => {
  // Core hooks
  const { lineUserId, isInitialized, error: liffError } = useLiff();
  const { isLoading: authLoading } = useAuth({ required: true });
  const { toast } = useToast();

  // Local state
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [cachedAttendanceStatus, setCachedAttendanceStatus] =
    useState<AttendanceStatusInfo | null>(null);
  const [isUserDataLoading, setIsUserDataLoading] = useState(true);

  // Debug logging
  useEffect(() => {
    console.log('Prerequisites state:', {
      lineUserId,
      isInitialized,
      authLoading,
      hasUserData: !!userData,
      isUserDataLoading,
    });
  }, [lineUserId, isInitialized, authLoading, userData, isUserDataLoading]);

  // Fetch user data
  useEffect(() => {
    let isMounted = true;

    const fetchUserData = async () => {
      if (!lineUserId || authLoading || !isInitialized) return;

      try {
        setIsUserDataLoading(true);
        const response = await fetch('/api/user-data', {
          headers: { 'x-line-userid': lineUserId },
        });

        if (!response.ok) throw new Error('Failed to fetch user data');
        const data = await response.json();

        if (!isMounted) return;

        if (data?.user) {
          console.log('User data received:', data.user);
          setUserData(data.user);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError('Failed to fetch user data');
      } finally {
        if (isMounted) {
          setIsUserDataLoading(false);
        }
      }
    };

    fetchUserData();
    return () => {
      isMounted = false;
    };
  }, [lineUserId, authLoading, isInitialized]);

  // Initialize attendance tracking
  const {
    attendanceStatus,
    effectiveShift,
    isLoading: isAttendanceLoading,
    locationReady,
    error: attendanceError,
    inPremises,
    address,
    checkInOutAllowance,
    refreshAttendanceStatus,
    checkInOut,
    getCurrentLocation,
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId,
    initialAttendanceStatus: cachedAttendanceStatus,
    enabled: Boolean(
      userData?.employeeId && !isUserDataLoading && !authLoading,
    ),
  });

  console.log('Attendance status:', {
    attendanceStatus,
    effectiveShift,
    isAttendanceLoading,
    locationReady,
    attendanceError,
    inPremises,
    address,
    checkInOutAllowance,
  });

  // Determine if all data is ready
  const isDataReady = useMemo(() => {
    const ready = Boolean(
      userData?.employeeId &&
        !authLoading &&
        !isUserDataLoading &&
        locationReady &&
        !isAttendanceLoading,
    );

    console.log('Data ready check:', {
      hasEmployeeId: Boolean(userData?.employeeId),
      authLoading,
      isUserDataLoading,
      locationReady,
      isAttendanceLoading,
      isReady: ready,
    });

    return ready;
  }, [
    userData?.employeeId,
    authLoading,
    isUserDataLoading,
    locationReady,
    isAttendanceLoading,
  ]);

  // Handle status changes
  const handleStatusChange = useCallback(
    async (params: StatusChangeParams) => {
      if (!userData?.employeeId || !checkInOutAllowance || !address) {
        const error = new Error('Missing required data. Please try again.');
        setFormError(error.message);
        throw error;
      }

      try {
        await checkInOut({
          employeeId: userData.employeeId,
          lineUserId: userData.lineUserId,
          isCheckIn: params.isCheckingIn,
          checkTime: getCurrentTime().toISOString(),
          address,
          reason: params.lateReason,
          photo: params.photo,
          isLate: params.isLate,
          isOvertime: params.isOvertime,
          isEarlyCheckOut: params.isEarlyCheckOut,
          earlyCheckoutType: params.earlyCheckoutType,
          isManualEntry: false,
          entryType: params.isOvertime
            ? PeriodType.OVERTIME
            : PeriodType.REGULAR,
          confidence: inPremises ? 'high' : 'low',
          metadata: {
            overtimeId: checkInOutAllowance.metadata?.overtimeId,
            isDayOffOvertime: checkInOutAllowance.flags?.isDayOffOvertime,
            isInsideShiftHours: checkInOutAllowance.flags?.isInsideShift,
          },
        });

        closeWindow();
      } catch (error) {
        console.error('Error in handleStatusChange:', error);
        setFormError(
          error instanceof Error ? error.message : 'An error occurred',
        );
        closeWindow();
      }
    },
    [userData, checkInOutAllowance, address, inPremises, checkInOut],
  );

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (!userData?.employeeId) return;

    try {
      await Promise.all([
        CacheManager.invalidateCache('attendance', userData.employeeId),
        CacheManager.invalidateCache('user', userData.employeeId),
        CacheManager.invalidateCache('shift', userData.employeeId),
      ]);

      await refreshAttendanceStatus({ forceRefresh: true });
      toast({
        title: 'รีเฟรชข้อมูลสำเร็จ',
        duration: 2000,
      });
    } catch (error) {
      console.error('Refresh failed:', error);
      setFormError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      toast({
        variant: 'destructive',
        title: 'เกิดข้อผิดพลาด',
        description: 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
      });
    }
  }, [userData?.employeeId, refreshAttendanceStatus, toast]);

  // Handle close
  const handleCloseWindow = useCallback(() => {
    closeWindow();
  }, []);

  // Error boundary handler
  const handleError = useCallback(
    (error: Error) => {
      console.error('CheckInRouter error:', {
        message: error.message,
        stack: error.stack,
        userData: userData?.employeeId,
      });
      setFormError(error.message);
    },
    [userData?.employeeId],
  );

  // Loading state
  if (authLoading || !isInitialized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <LoadingBar />
        <p className="mt-4 text-gray-600">กำลังตรวจสอบสิทธิ์...</p>
      </div>
    );
  }

  // Error states
  if (liffError || !lineUserId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {liffError || 'LINE User ID not available'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-xl mb-6 text-gray-800">เกิดข้อผิดพลาด</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  // Main render
  return (
    <ErrorBoundary onError={handleError}>
      <div className="main-container flex flex-col min-h-screen bg-gray-100">
        <div className="sticky top-0 bg-white shadow-md z-20 px-4 py-3 safe-top">
          <h1 className="text-2xl font-bold text-center text-gray-800">
            {attendanceStatus?.isCheckingIn
              ? 'ระบบบันทึกเวลาเข้างาน'
              : 'ระบบบันทึกเวลาออกงาน'}
          </h1>
          <Clock />
        </div>

        <div className="flex-1 overflow-y-auto pb-32">
          {formError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 m-4 rounded relative">
              <strong className="font-bold">Error:</strong>
              <span className="block sm:inline ml-2">{formError}</span>
              <button
                className="absolute top-0 bottom-0 right-0 px-4 py-3"
                onClick={() => setFormError(null)}
              >
                <span className="sr-only">Dismiss</span>
                <svg
                  className="h-6 w-6 text-red-500"
                  role="button"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                >
                  <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-center justify-center h-full">
            {!isDataReady ? (
              <div className="flex flex-col items-center space-y-4">
                <LoadingBar />
                <p className="text-gray-600">
                  {isUserDataLoading
                    ? 'กำลังโหลดข้อมูลผู้ใช้...'
                    : !locationReady
                      ? 'กำลังตรวจสอบตำแหน่ง...'
                      : 'กำลังโหลดข้อมูล...'}
                </p>
              </div>
            ) : userData && effectiveShift ? (
              <CheckInOutForm
                userData={userData}
                cachedAttendanceStatus={cachedAttendanceStatus}
                liveAttendanceStatus={attendanceStatus}
                isCheckingIn={attendanceStatus?.isCheckingIn ?? true}
                effectiveShift={effectiveShift}
                isAttendanceLoading={isAttendanceLoading}
                checkInOutAllowance={checkInOutAllowance}
                getCurrentLocation={getCurrentLocation}
                refreshAttendanceStatus={handleRefresh}
                onStatusChange={handleStatusChange}
                onCloseWindow={handleCloseWindow}
              />
            ) : (
              <div className="text-center">
                <p className="text-gray-600">ไม่พบข้อมูลกะการทำงาน</p>
                <button
                  onClick={handleRefresh}
                  className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  ลองใหม่อีกครั้ง
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInRouter);
