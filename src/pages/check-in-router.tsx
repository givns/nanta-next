import React, { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { UserData } from '@/types/user';
import {
  AttendanceStatusInfo,
  CheckInOutAllowance,
  LocationState,
  PeriodType,
  StatusChangeParams,
  ShiftData,
  CheckStatus,
  AttendanceState,
  EarlyCheckoutType,
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

interface CheckInOutFormProps {
  userData: UserData;
  cachedAttendanceStatus: AttendanceStatusInfo | null;
  liveAttendanceStatus: AttendanceStatusInfo | null;
  isCheckingIn: boolean;
  effectiveShift: ShiftData | null;
  isAttendanceLoading: boolean;
  checkInOutAllowance: CheckInOutAllowance | null;
  getCurrentLocation: () => void;
  refreshAttendanceStatus: (forceRefresh: boolean) => Promise<void>;
  onStatusChange: (params: StatusChangeParams) => Promise<void>;
  onCloseWindow: () => void;
}

const CheckInRouter: React.FC = () => {
  // Hooks
  const { lineUserId, isInitialized, error: liffError } = useLiff();
  const { isLoading: authLoading } = useAuth({ required: true });
  const { toast } = useToast();

  // State
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [cachedAttendanceStatus, setCachedAttendanceStatus] =
    useState<AttendanceStatusInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isDataReady = useMemo(
    () =>
      userData && !authLoading && effectiveShift?.id && !isAttendanceLoading,
    [userData, authLoading],
  );
  // Attendance hook
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
    enabled: !!userData?.employeeId && !!lineUserId,
  });

  // Initial data fetch
  useEffect(() => {
    let isMounted = true;

    const fetchInitialData = async () => {
      if (!lineUserId) {
        setError('LINE User ID not available');
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/user-data', {
          headers: { 'x-line-userid': lineUserId },
        });
        if (!response.ok) throw new Error('Failed to fetch user data');
        const data = await response.json();

        if (!isMounted) return;

        if (data?.user) {
          setUserData(data.user);
          const now = getCurrentTime();
          const today = format(now, 'yyyy-MM-dd');

          // Only fetch attendance status after user data is set
          if (isDataReady) {
            try {
              const attendanceResponse = await fetch('/api/attendance-status', {
                headers: {
                  'x-line-userid': lineUserId,
                  'x-employee-id': data.user.employeeId,
                },
              });
              if (!attendanceResponse.ok)
                throw new Error('Failed to fetch attendance status');
              const attendanceData = await attendanceResponse.json();

              if (isMounted && attendanceData) {
                setCachedAttendanceStatus(attendanceData);
              }
            } catch (error) {
              console.error('Error fetching cached attendance:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
        if (isMounted) {
          setError('Failed to fetch initial data');
          if (userData?.employeeId) {
            // Use the correct static methods
            await Promise.all([
              CacheManager.invalidateCache('attendance', userData.employeeId),
              CacheManager.invalidateCache('user', userData.employeeId),
              CacheManager.invalidateCache('shift', userData.employeeId),
            ]);
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, [lineUserId, isDataReady]);

  // Handle status change
  const handleStatusChange = useCallback<CheckInOutFormProps['onStatusChange']>(
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
  const handleRefresh = useCallback<
    CheckInOutFormProps['refreshAttendanceStatus']
  >(
    async (forceRefresh: boolean) => {
      if (isRefreshing) return;

      try {
        setIsRefreshing(true);
        if (!userData?.employeeId) return;

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
      } finally {
        setIsRefreshing(false);
      }
    },
    [userData, refreshAttendanceStatus, toast, isRefreshing],
  );

  // Handlers
  const handleCloseWindow = useCallback<
    CheckInOutFormProps['onCloseWindow']
  >(() => {
    closeWindow();
  }, []);

  // Loading states
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

  return (
    <ErrorBoundary>
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

          <ErrorBoundary
            onError={(error: Error) => {
              console.error('Error in CheckInOutForm:', error);
              setFormError(error.message);
            }}
          >
            <div className="flex items-center justify-center h-full">
              {isDataReady ? (
                userData && (
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
                )
              ) : (
                <div className="flex items-center justify-center h-full">
                  <LoadingBar />
                </div>
              )}
            </div>
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInRouter);
