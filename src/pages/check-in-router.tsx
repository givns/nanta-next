// check-in-router.tsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { UserData } from '@/types/user';
import {
  AttendanceStatusInfo,
  CheckInOutData,
  PeriodType,
} from '@/types/attendance';
import { CacheManager } from '@/services/CacheManager';
import Clock from '@/components/Clock';
import { closeWindow } from '@/services/liff';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import LoadingBar from '@/components/LoadingBar';
import PullToRefresh from '@/components/PullToRefresh';
import { useLiff } from '@/contexts/LiffContext';
import { useAuth } from '@/hooks/useAuth';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';

const CheckInOutForm = dynamic(
  () => import('../components/attendance/CheckInOutForm'),
  {
    ssr: false,
  },
);

const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

const CheckInRouter: React.FC = () => {
  // Hooks
  const { lineUserId, isInitialized, error: liffError } = useLiff();
  const { isLoading: authLoading } = useAuth({
    required: true, // Require auth but no specific roles
  });
  const { toast } = useToast();

  // State
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [cachedAttendanceStatus, setCachedAttendanceStatus] =
    useState<AttendanceStatusInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Cache helpers
  const getCacheKey = useCallback((type: 'user' | 'attendance', id: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return type === 'user' ? `user:${id}` : `attendance:${id}:${today}`;
  }, []);

  // Simple attendance hook
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
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId,
    initialAttendanceStatus: cachedAttendanceStatus,
  });

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!lineUserId) {
        setError('LINE User ID not available');
        setIsLoading(false);
        return;
      }

      try {
        // Fetch user data function
        const fetchUserData = async () => {
          const response = await fetch('/api/user-data', {
            headers: { 'x-line-userid': lineUserId },
          });
          if (!response.ok) throw new Error('Failed to fetch user data');
          return response.json();
        };

        // Try to get cached user data
        const cachedUser = await CacheManager.getCachedUserData(
          lineUserId,
          fetchUserData,
        );

        if (cachedUser?.user) {
          setUserData(cachedUser.user);

          // Get cached attendance status
          const today = format(new Date(), 'yyyy-MM-dd');
          const fetchAttendanceStatus = async () => {
            const response = await fetch('/api/attendance-status', {
              headers: {
                'x-line-userid': lineUserId,
                'x-employee-id': cachedUser.user.employeeId,
              },
            });
            if (!response.ok)
              throw new Error('Failed to fetch attendance status');
            return response.json();
          };

          const cachedStatus = await CacheManager.getCachedAttendanceData(
            cachedUser.user.employeeId,
            today,
            fetchAttendanceStatus,
          );

          if (cachedStatus) {
            setCachedAttendanceStatus(cachedStatus);
          }
        } else {
          // Fetch fresh data if no cache
          const freshUserData = await fetchUserData();
          setUserData(freshUserData.user);
          await CacheManager.setCacheData(
            getCacheKey('user', lineUserId),
            freshUserData,
          );
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setError('Failed to fetch initial data');
        // Clear invalid cache if any
        if (userData?.employeeId) {
          await CacheManager.invalidateAllEmployeeData(userData.employeeId);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [lineUserId, getCacheKey]);

  // Background refresh effect
  useEffect(() => {
    if (!userData?.employeeId) return;

    const refreshInterval = setInterval(async () => {
      try {
        await refreshAttendanceStatus({
          forceRefresh: false,
          throwOnError: false,
        });
      } catch (error) {
        console.error('Background refresh failed:', error);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(refreshInterval);
  }, [userData?.employeeId, refreshAttendanceStatus]);

  // Handlers
  const handleRefresh = async () => {
    if (isRefreshing) return;

    try {
      setIsRefreshing(true);
      if (!userData?.employeeId) return;

      await CacheManager.invalidateAllEmployeeData(userData.employeeId);
      await refreshAttendanceStatus({ forceRefresh: true }); // Fixed type
      await getCurrentLocation();

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
    } finally {
      setIsRefreshing(false);
    }
  };

  // Modified handleStatusChange
  const handleStatusChange = useCallback(
    async (
      newStatus: boolean,
      photo?: string,
      lateReason?: string,
      isLate?: boolean,
      isOvertime?: boolean,
    ) => {
      if (!userData?.employeeId || !checkInOutAllowance || !address) {
        const error = new Error('Missing required data. Please try again.');
        setFormError(error.message);
        throw error;
      }

      try {
        const serverTimeResponse = await fetch('/api/server-time');
        const { serverTime } = await serverTimeResponse.json();

        const checkInOutData: CheckInOutData = {
          employeeId: userData.employeeId,
          lineUserId: userData.lineUserId,
          isCheckIn: newStatus,
          checkTime: serverTime,
          address,
          reason: lateReason || '',
          photo,
          isLate: isLate || false,
          isOvertime: isOvertime || false,
          isManualEntry: false,
          entryType: isOvertime ? PeriodType.OVERTIME : PeriodType.REGULAR,
          metadata: {
            overtimeId: checkInOutAllowance.metadata?.overtimeId,
            isDayOffOvertime: checkInOutAllowance.flags?.isDayOffOvertime,
            isInsideShiftHours: checkInOutAllowance.flags?.isInsideShift,
          },
        };

        await checkInOut(checkInOutData);
      } catch (error: any) {
        console.error('Error during check-in/out:', error);
        const errorMessage = error.response?.data?.error || error.message;
        setFormError(`Failed to update status. ${errorMessage}`);
        throw error;
      }
    },
    [userData, checkInOutAllowance, address, checkInOut],
  );

  // Background refresh modification
  useEffect(() => {
    if (!userData?.employeeId) return;

    const refreshInterval = setInterval(async () => {
      try {
        await refreshAttendanceStatus({ forceRefresh: false }); // Fixed type
      } catch (error) {
        console.error('Background refresh failed:', error);
      }
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, [userData?.employeeId, refreshAttendanceStatus]);

  const handleCloseWindow = useCallback(() => {
    closeWindow();
  }, []);

  // Memoized form component
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
          refreshAttendanceStatus={async (forceRefresh) => {
            await refreshAttendanceStatus({ forceRefresh });
          }}
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
      getCurrentLocation,
      refreshAttendanceStatus,
      handleStatusChange,
      handleCloseWindow,
    ],
  );

  // Determine ready state
  const isDataReady = userData && checkInOutAllowance && !isAttendanceLoading;

  // Loading state
  if (authLoading || !isInitialized) {
    return <LoadingBar />;
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
    <ErrorBoundary>
      <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
        <div className="main-container flex flex-col min-h-screen bg-gray-100">
          {/* Fixed header */}
          <div className="sticky top-0 bg-white shadow-md z-20 px-4 py-3 safe-top">
            <h1 className="text-2xl font-bold text-center text-gray-800">
              {attendanceStatus?.isCheckingIn
                ? 'ระบบบันทึกเวลาเข้างาน'
                : 'ระบบบันทึกเวลาออกงาน'}
            </h1>
            <Clock />
          </div>

          {/* Scrollable content area */}
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

            {/* Main content */}
            <ErrorBoundary
              onError={(error: Error) => {
                console.error('Error in CheckInOutForm:', error);
                setFormError(error.message);
              }}
            >
              <div className="h-full">
                {isDataReady ? (
                  userData && memoizedCheckInOutForm
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <LoadingBar />
                  </div>
                )}
              </div>
            </ErrorBoundary>
          </div>
        </div>
      </PullToRefresh>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInRouter);
