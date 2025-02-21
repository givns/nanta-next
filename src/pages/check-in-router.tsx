import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { UserData } from '@/types/user';
import { PeriodType } from '@prisma/client';
import CheckInOutForm from '@/components/attendance/CheckInOutForm';
import { closeWindow } from '@/services/liff';
import LoadingBar from '@/components/attendance/LoadingBar';
import {
  AttendanceRecord,
  NextDayScheduleInfo,
  SerializedAttendanceRecord,
} from '@/types/attendance';
import TodaySummary from '@/components/attendance/TodaySummary';
import NextDayInfo from '@/components/attendance/NextDayInformation';
import { LoadingSpinner } from '@/components/LoadingSpinnner';
import useLocationVerification from '@/hooks/useLocationVerification';
import { getCurrentTime } from '@/utils/dateUtils';
import {
  subMinutes,
  format,
  addDays,
  isAfter,
  parseISO,
  startOfDay,
} from 'date-fns';

type Step = 'auth' | 'user' | 'location' | 'ready';
type LoadingPhase = 'loading' | 'fadeOut' | 'complete';

const createSafeAttendance = (props: any) => {
  if (!props) {
    console.warn('No attendance props provided');
    return null;
  }

  console.log('Creating safe attendance:', {
    hasTimeWindow: !!props?.periodState?.timeWindow,
    timeWindow: props?.periodState?.timeWindow,
    rawPeriodState: props?.periodState,
  });

  try {
    if (!props.base?.state || !props.context?.shift?.id) {
      console.log('Missing required base data');
      return null;
    }

    return {
      state: props.state,
      checkStatus: props.checkStatus,
      isCheckingIn: props.isCheckingIn,
      base: props.base,
      periodState: props.periodState,
      stateValidation: props.stateValidation,
      context: props.context,
      transitions: props.transitions || [],
      hasPendingTransition: props.hasPendingTransition,
      nextTransition: props.nextTransition,
      isDayOff: props.isDayOff,
      isHoliday: props.isHoliday,
      isAdjusted: props.isAdjusted,
      holidayInfo: props.holidayInfo,
      nextPeriod: props.nextPeriod,
      transition: props.transition,
      shift: props.shift,
      checkInOut: props.checkInOut,
      refreshAttendanceStatus: props.refreshAttendanceStatus,
      getCurrentLocation: props.getCurrentLocation,
    };
  } catch (error) {
    console.error('Error creating safe attendance:', error);
    return null;
  }
};

const CheckInRouter: React.FC = () => {
  // States
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [currentStep, setCurrentStep] = useState<Step>('auth');
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('loading');
  const [showNextDay, setShowNextDay] = useState(false);
  const [isLoadingNextDay, setIsLoadingNextDay] = useState(false);
  const [nextDayData, setNextDayData] = useState<NextDayScheduleInfo | null>(
    null,
  );

  // Core Hooks
  const { lineUserId, isInitialized } = useLiff();
  const { isLoading: authLoading } = useAuth({ required: true });
  const {
    isLoading: attendanceLoading,
    error: attendanceError,
    refreshAttendanceStatus,
    ...attendanceProps
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId: lineUserId || '',
    enabled: Boolean(userData?.employeeId && !authLoading),
  });
  const {
    locationState,
    needsVerification,
    isVerified,
    isAdminPending,
    triggerReason,
    verifyLocation,
    requestAdminAssistance,
  } = useLocationVerification(userData?.employeeId, {
    onAdminApproval: refreshAttendanceStatus,
  });

  // Step management
  const evaluateStep = useCallback(() => {
    // 1. First check auth
    if (authLoading) {
      return 'auth';
    }

    // 2. Then check user data
    if (!userData?.employeeId) {
      return 'user';
    }

    // Modified location state handling
    if (
      locationState.verificationStatus === 'admin_pending' ||
      locationState.status === 'waiting_admin'
    ) {
      return 'location';
    }

    if (locationState.verificationStatus === 'verified') {
      return 'ready';
    }

    // 3. Finally handle location states
    const hasLocationIssue = Boolean(
      locationState.status === 'error' ||
        locationState.error ||
        locationState.verificationStatus === 'needs_verification' ||
        locationState.triggerReason === 'Location permission denied',
    );

    if (hasLocationIssue) {
      return 'location';
    }

    return 'ready';
  }, [authLoading, userData, locationState]);

  // Debug effect to track state changes
  useEffect(() => {
    console.log('Step Evaluation State:', {
      locationStatus: locationState.status,
      error: locationState.error,
      verificationStatus: locationState.verificationStatus,
      currentStep,
      hasError: Boolean(
        locationState.status === 'error' ||
          locationState.error ||
          locationState.verificationStatus === 'needs_verification',
      ),
      needsVerification,
      isVerified,
    });
  }, [locationState, currentStep, needsVerification, isVerified]);

  // Unified step management
  useEffect(() => {
    const nextStep = evaluateStep();
    if (nextStep !== currentStep) {
      console.log('Step Transition:', {
        from: currentStep,
        to: nextStep,
        locationState: {
          status: locationState.status,
          error: locationState.error,
          verificationStatus: locationState.verificationStatus,
        },
        needsVerification,
        isVerified,
        userData: Boolean(userData),
      });
      setCurrentStep(nextStep);
    }
  }, [
    evaluateStep,
    currentStep,
    locationState,
    needsVerification,
    isVerified,
    userData,
  ]);

  // Loading Phase Management
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const shouldShowLoading =
      currentStep === 'auth' ||
      currentStep === 'user' ||
      currentStep === 'location' ||
      locationState.status === 'error' ||
      locationState.verificationStatus === 'needs_verification' ||
      isAdminPending;

    if (shouldShowLoading) {
      setLoadingPhase('loading');
    } else if (currentStep === 'ready' && !attendanceLoading && userData) {
      if (loadingPhase === 'loading') {
        setLoadingPhase('fadeOut');
      } else if (loadingPhase === 'fadeOut') {
        timer = setTimeout(() => setLoadingPhase('complete'), 500);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    currentStep,
    attendanceLoading,
    userData,
    loadingPhase,
    locationState.status,
    locationState.verificationStatus,
    isAdminPending,
  ]);

  useEffect(() => {
    console.log('Router State:', {
      currentStep,
      locationState: {
        status: locationState.status,
        error: locationState.error,
        verificationStatus: locationState.verificationStatus,
      },
      needsVerification,
    });
  }, [currentStep, locationState, needsVerification]);

  // Handle location retry
  const handleLocationRetry = useCallback(async () => {
    await verifyLocation(true);
  }, [verifyLocation]);

  const handleRequestAdminAssistance = useCallback(async () => {
    if (!requestAdminAssistance) {
      console.warn('Admin assistance function is not available');
      return;
    }

    try {
      console.log('Requesting admin assistance...');
      await requestAdminAssistance();
    } catch (error) {
      console.error('Error requesting admin assistance:', error);
    }
  }, [requestAdminAssistance]);

  // Fetch user data with retry logic
  const fetchUserData = useCallback(async () => {
    if (!lineUserId || authLoading || !isInitialized) return;

    try {
      const response = await fetch('/api/user-data', {
        headers: { 'x-line-userid': lineUserId },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch user data: ${errorText}`);
      }

      const data = await response.json();
      if (!data?.user) throw new Error('No user data received');

      setUserData(data.user);
      setError(null); // Clear error on success
      setRetryCount(0); // Reset retry count
    } catch (error) {
      console.error('Error fetching user data:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch user data';
      setError(errorMessage);

      // Implement retry logic with backoff
      if (retryCount < 3) {
        const timeout = Math.pow(2, retryCount) * 1000; // Exponential backoff
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          fetchUserData();
        }, timeout);
      }
    }
  }, [lineUserId, authLoading, isInitialized, retryCount]);

  // Next Day Data Handlers
  const fetchNextDayInfo = useCallback(async () => {
    if (!userData?.employeeId) return;

    try {
      setIsLoadingNextDay(true);
      const response = await fetch(
        `/api/attendance/next-day/${userData.employeeId}`,
      );
      if (!response.ok) throw new Error('Failed to fetch next day info');
      const data = await response.json();
      setNextDayData(data);
    } catch (error) {
      console.error('Error fetching next day info:', error);
    } finally {
      setIsLoadingNextDay(false);
    }
  }, [userData?.employeeId]);

  const handleViewNextDay = useCallback(() => {
    setShowNextDay(true);
    fetchNextDayInfo();
  }, [fetchNextDayInfo]);

  // Process attendance props
  const safeAttendanceProps = useMemo(
    () => (attendanceProps ? createSafeAttendance(attendanceProps) : null),
    [attendanceProps],
  );

  // Then the dailyRecords memo that uses it
  const dailyRecords = useMemo(() => {
    if (!safeAttendanceProps?.base) return [];

    try {
      const attendance = safeAttendanceProps.base.latestAttendance;
      const additionalRecords =
        safeAttendanceProps.base.additionalRecords || [];
      const allRecords = [...additionalRecords];

      if (
        attendance &&
        !additionalRecords.find(
          (record: AttendanceRecord) => record.id === attendance.id,
        )
      ) {
        allRecords.push(attendance);
      }

      const sortedRecords = allRecords.sort((a, b) => {
        if (a.type !== b.type) return a.type === PeriodType.REGULAR ? -1 : 1;
        return (
          new Date(a.CheckInTime || 0).getTime() -
          new Date(b.CheckInTime || 0).getTime()
        );
      });

      return sortedRecords.map((record, index) => ({
        record,
        periodSequence: index + 1,
      }));
    } catch (error) {
      console.error('Error processing daily records:', error);
      return [];
    }
  }, [safeAttendanceProps?.base]);

  // Check Period Completion
  const isAllPeriodsCompleted = useMemo(() => {
    if (!safeAttendanceProps?.base) return false;

    try {
      const now = getCurrentTime();
      const lastRecord = dailyRecords[dailyRecords.length - 1]?.record;

      // First check if there's pending overtime
      if (
        safeAttendanceProps.context?.nextPeriod?.type === PeriodType.OVERTIME ||
        safeAttendanceProps.context?.transition?.to?.type ===
          PeriodType.OVERTIME
      ) {
        return false; // Can't be complete if overtime is pending
      }

      // Log for debugging
      console.log('Checking period completion:', {
        recordCount: dailyRecords.length,
        lastRecord: lastRecord
          ? {
              id: lastRecord.id,
              checkIn: lastRecord.CheckInTime,
              checkOut: lastRecord.CheckOutTime,
              type: lastRecord.type,
              state: lastRecord.state,
              checkStatus: lastRecord.checkStatus,
            }
          : null,
        currentTime: format(now, 'HH:mm:ss'),
      });

      // For overnight shifts, check against shift end time instead of calendar day
      if (lastRecord?.CheckOutTime && lastRecord?.shiftEndTime) {
        // If current time is after shift end time, it's a new shift period
        // This covers both regular and overnight shifts
        if (now > new Date(lastRecord.shiftEndTime)) {
          return false;
        }
      }

      // Check regular period completion
      const regularRecord = dailyRecords.find(({ record }) => {
        // Only consider records from today for completion check
        const recordDate = startOfDay(new Date(record.date));
        const today = startOfDay(now);
        return (
          record.type === PeriodType.REGULAR &&
          recordDate.getTime() === today.getTime()
        );
      });

      const isRegularComplete =
        regularRecord?.record.CheckOutTime &&
        regularRecord.record.state === 'PRESENT' &&
        regularRecord.record.checkStatus === 'CHECKED_OUT';

      // Log for debugging
      console.log('Regular period check:', {
        today: startOfDay(now).toISOString(),
        recordFound: regularRecord
          ? {
              date: regularRecord.record.date,
              checkIn: regularRecord.record.CheckInTime,
              checkOut: regularRecord.record.CheckOutTime,
            }
          : null,
        isRegularComplete,
      });

      // Check overtime completion
      const overtimeRecords = dailyRecords.filter(
        ({ record }) => record.type === PeriodType.OVERTIME,
      );

      const areAllOvertimeComplete =
        overtimeRecords.length > 0 &&
        overtimeRecords.every(
          ({ record }) => record.CheckOutTime && record.state === 'PRESENT',
        );

      const allComplete = Boolean(
        isRegularComplete &&
          (overtimeRecords.length === 0 || areAllOvertimeComplete),
      );

      // If periods are complete, only check if we're approaching next shift
      if (allComplete && safeAttendanceProps.shift) {
        const nextShiftTime = safeAttendanceProps.shift.startTime;
        const currentShiftEnd =
          safeAttendanceProps.base.latestAttendance?.shiftEndTime;
        const isOvernight = currentShiftEnd && currentShiftEnd > now;

        // Calculate next shift start
        const nextShiftStart = isOvernight
          ? parseISO(`${format(now, 'yyyy-MM-dd')}T${nextShiftTime}:00.000Z`)
          : parseISO(
              `${format(addDays(now, 1), 'yyyy-MM-dd')}T${nextShiftTime}:00.000Z`,
            );

        const approachingNextShift = subMinutes(nextShiftStart, 30);

        // Only return false if we're within 30 minutes of next shift
        if (isAfter(now, approachingNextShift)) {
          return false;
        }
      }

      return allComplete;
    } catch (error) {
      console.error('Error checking period completion:', error);
      return false;
    }
  }, [
    safeAttendanceProps?.base,
    safeAttendanceProps?.context,
    safeAttendanceProps?.shift,
    dailyRecords,
  ]);

  // Location state effect
  useEffect(() => {
    console.log('Location state updated:', locationState);
  }, [locationState]);

  // Initial data fetch
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Handle refresh on API error
  const handleRefreshData = useCallback(async () => {
    if (attendanceError) {
      try {
        setError(null);
        await refreshAttendanceStatus();
      } catch (err) {
        console.error('Error refreshing attendance data:', err);
        setError('Failed to refresh data. Please try again.');
      }
    }
  }, [attendanceError, refreshAttendanceStatus]);

  const mainContent = useMemo(() => {
    // Early return if we don't have required data
    if (!userData?.employeeId) return null;
    // Process attendance props
    const safeProps = safeAttendanceProps
      ? createSafeAttendance(safeAttendanceProps)
      : null;

    // Show error state if there's an API error
    if (attendanceError) {
      // Helper function to safely extract error message
      const getErrorMessage = (error: unknown): string => {
        if (error === null || error === undefined) {
          return 'ไม่สามารถโหลดข้อมูลการลงเวลาได้';
        }

        if (typeof error === 'string') {
          return error;
        }

        if (typeof error === 'object') {
          // Check if it has a message property
          if ('message' in error && typeof error.message === 'string') {
            return error.message;
          }

          // Try to stringify the object
          try {
            return JSON.stringify(error);
          } catch (e) {
            // If stringify fails
            return 'เกิดข้อผิดพลาดที่ไม่สามารถระบุได้';
          }
        }

        return 'ไม่สามารถโหลดข้อมูลการลงเวลาได้';
      };

      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
          <Alert className="max-w-md w-full mb-4 bg-red-50 border-red-200">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <AlertTitle className="text-red-700 mb-2">
              เกิดข้อผิดพลาดในการโหลดข้อมูล
            </AlertTitle>
            <AlertDescription className="text-red-600">
              {getErrorMessage(attendanceError)}
            </AlertDescription>
          </Alert>
          <button
            onClick={handleRefreshData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={16} /> ลองใหม่อีกครั้ง
          </button>
        </div>
      );
    }

    if (!safeProps?.base?.state) {
      console.log('Missing required attendance data', {
        hasProps: !!safeAttendanceProps,
        hasBase: !!safeProps?.base,
        state: safeProps?.base?.state,
      });
      return null;
    }
    const serializeRecords = (
      records: Array<{
        record: AttendanceRecord;
        periodSequence: number;
      }>,
    ): Array<{
      record: SerializedAttendanceRecord;
      periodSequence: number;
    }> => {
      return records.map(({ record, periodSequence }) => ({
        record: {
          ...record,
          date:
            record.date instanceof Date
              ? record.date.toISOString()
              : record.date,
          shiftStartTime:
            record.shiftStartTime instanceof Date
              ? record.shiftStartTime.toISOString()
              : record.shiftStartTime,
          shiftEndTime:
            record.shiftEndTime instanceof Date
              ? record.shiftEndTime.toISOString()
              : record.shiftEndTime,
          CheckInTime:
            record.CheckInTime instanceof Date
              ? record.CheckInTime.toISOString()
              : record.CheckInTime,
          CheckOutTime:
            record.CheckOutTime instanceof Date
              ? record.CheckOutTime.toISOString()
              : record.CheckOutTime,
          metadata: {
            ...record.metadata,
            createdAt:
              record.metadata.createdAt instanceof Date
                ? record.metadata.createdAt.toISOString()
                : record.metadata.createdAt,
            updatedAt:
              record.metadata.updatedAt instanceof Date
                ? record.metadata.updatedAt.toISOString()
                : record.metadata.updatedAt,
          },
          overtimeEntries: record.overtimeEntries.map((entry) => ({
            ...entry,
            actualStartTime:
              entry.actualStartTime instanceof Date
                ? entry.actualStartTime.toISOString()
                : entry.actualStartTime,
            actualEndTime:
              entry.actualEndTime instanceof Date
                ? entry.actualEndTime.toISOString()
                : entry.actualEndTime,
            createdAt:
              entry.createdAt instanceof Date
                ? entry.createdAt.toISOString()
                : entry.createdAt,
            updatedAt:
              entry.updatedAt instanceof Date
                ? entry.updatedAt.toISOString()
                : entry.updatedAt,
          })),
          timeEntries: record.timeEntries.map((entry) => ({
            ...entry,
            startTime:
              entry.startTime instanceof Date
                ? entry.startTime.toISOString()
                : entry.startTime,
            endTime:
              entry.endTime instanceof Date
                ? entry.endTime.toISOString()
                : entry.endTime,
            metadata: {
              ...entry.metadata,
              createdAt:
                entry.metadata.createdAt instanceof Date
                  ? entry.metadata.createdAt.toISOString()
                  : entry.metadata.createdAt,
              updatedAt:
                entry.metadata.updatedAt instanceof Date
                  ? entry.metadata.updatedAt.toISOString()
                  : entry.metadata.updatedAt,
            },
          })),
        },
        periodSequence,
      }));
    };

    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        {isAdminPending && (
          <div className="fixed top-0 left-0 right-0 bg-yellow-50 p-4 z-50">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {triggerReason && (
                  <p className="mb-1 text-sm font-medium">
                    เหตุผล: {triggerReason}
                  </p>
                )}
                รอการยืนยันตำแหน่งจากเจ้าหน้าที่
              </AlertDescription>
            </Alert>
          </div>
        )}

        {isAllPeriodsCompleted ? (
          showNextDay ? (
            isLoadingNextDay || !nextDayData ? (
              <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <LoadingSpinner />
              </div>
            ) : (
              <NextDayInfo
                nextDayInfo={nextDayData}
                onClose={() => setShowNextDay(false)}
              />
            )
          ) : (
            <TodaySummary
              userData={userData}
              records={serializeRecords(dailyRecords)}
              onViewNextDay={handleViewNextDay}
              onClose={closeWindow}
            />
          )
        ) : (
          <CheckInOutForm
            userData={userData}
            onComplete={closeWindow}
            {...safeProps}
          />
        )}
      </div>
    );
  }, [
    userData,
    safeAttendanceProps,
    dailyRecords,
    isAllPeriodsCompleted,
    showNextDay,
    nextDayData,
    isLoadingNextDay,
    handleViewNextDay,
    triggerReason,
    isAdminPending,
    attendanceError,
    handleRefreshData,
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {loadingPhase !== 'complete' && (
        <div
          key={`${currentStep}-${locationState.status}-${locationState.verificationStatus}-${isAdminPending}`}
          className={`fixed inset-0 z-50 bg-white transition-opacity duration-500 ${
            loadingPhase === 'fadeOut' ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <LoadingBar
            step={currentStep}
            locationState={locationState}
            onLocationRetry={handleLocationRetry}
            onRequestAdminAssistance={handleRequestAdminAssistance}
          />
        </div>
      )}

      {loadingPhase === 'complete' &&
      (!userData?.employeeId || !safeAttendanceProps) ? (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-white">
          <div className="text-center">
            <div className="text-red-500 font-medium mb-4">
              {error || 'ข้อมูลไม่ครบถ้วน กรุณาลองใหม่อีกครั้ง'}
            </div>
            <button
              type="button"
              onClick={fetchUserData}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
            >
              ลองใหม่อีกครั้ง
            </button>
          </div>
        </div>
      ) : (
        mainContent
      )}
    </div>
  );
};

export default React.memo(CheckInRouter);
