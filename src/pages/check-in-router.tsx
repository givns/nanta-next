import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
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
import { useLocationVerification } from '@/hooks/useLocationVerification';

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
    locationState,
    isLoading: locationLoading,
    needsVerification,
    isVerified,
    isAdminPending,
    triggerReason,
    verifyLocation,
    requestAdminAssistance,
  } = useLocationVerification(userData?.employeeId);

  const {
    isLoading: attendanceLoading,
    error: attendanceError,
    ...attendanceProps
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId: lineUserId || '',
    enabled: Boolean(userData?.employeeId && !authLoading),
  });

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

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!lineUserId || authLoading || !isInitialized) return;

    try {
      setCurrentStep('user');
      const response = await fetch('/api/user-data', {
        headers: { 'x-line-userid': lineUserId },
      });

      if (!response.ok) throw new Error('Failed to fetch user data');

      const data = await response.json();
      if (!data?.user) throw new Error('No user data received');

      setUserData(data.user);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to fetch user data',
      );
    }
  }, [lineUserId, authLoading, isInitialized]);

  // Handle location retry
  const handleLocationRetry = useCallback(async () => {
    await verifyLocation(true);
  }, [verifyLocation]);

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
      const regularRecord = dailyRecords.find(
        ({ record }) =>
          record.type === PeriodType.REGULAR &&
          record.overtimeState === 'COMPLETED',
      );
      const overtimeRecord = dailyRecords.find(
        ({ record }) =>
          record.type === PeriodType.OVERTIME &&
          record.overtimeState === 'COMPLETED',
      );

      return Boolean(
        regularRecord?.record.CheckOutTime &&
          regularRecord.record.state === 'PRESENT' &&
          regularRecord.record.overtimeState === 'COMPLETED' &&
          (!overtimeRecord ||
            (overtimeRecord.record.CheckOutTime &&
              overtimeRecord.record.state === 'PRESENT' &&
              overtimeRecord.record.overtimeState === 'COMPLETED')),
      );
    } catch (error) {
      console.error('Error checking period completion:', error);
      return false;
    }
  }, [safeAttendanceProps?.base, dailyRecords]);

  // Step Management
  useEffect(() => {
    if (authLoading) return;

    const nextStep = (() => {
      if (
        locationState.status === 'error' ||
        locationState.error ||
        locationState.verificationStatus === 'needs_verification'
      ) {
        return 'location';
      }
      if (!userData) return 'user';
      if (!isVerified && (needsVerification || locationLoading))
        return 'location';
      return 'ready';
    })();

    if (nextStep !== currentStep) {
      console.log('Step changing:', { from: currentStep, to: nextStep });
      setCurrentStep(nextStep);
    }
  }, [
    authLoading,
    userData,
    isVerified,
    needsVerification,
    locationLoading,
    locationState.status,
    locationState.error,
    locationState.verificationStatus,
    currentStep,
  ]);

  // Loading Phase Management
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const shouldShowLoading =
      currentStep === 'location' ||
      locationState.status === 'error' ||
      locationState.verificationStatus === 'needs_verification';

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
  ]);

  // Initial data fetch
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const mainContent = useMemo(() => {
    if (!userData || !safeAttendanceProps?.base?.state) return null;

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

    // Show summary if all periods completed
    if (isAllPeriodsCompleted) {
      if (showNextDay) {
        if (isLoadingNextDay || !nextDayData) {
          return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
              <LoadingSpinner />
            </div>
          );
        }

        return (
          <NextDayInfo
            nextDayInfo={nextDayData}
            onClose={() => setShowNextDay(false)}
          />
        );
      }

      return (
        <TodaySummary
          userData={userData}
          records={serializeRecords(dailyRecords)}
          onViewNextDay={handleViewNextDay}
          onClose={closeWindow}
        />
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <CheckInOutForm
          userData={userData}
          onComplete={closeWindow}
          {...safeAttendanceProps}
        />
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
  ]);

  // Error state
  if (error || attendanceError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error || attendanceError}</AlertDescription>
      </Alert>
    );
  }

  // Loading state
  if (loadingPhase !== 'complete' || !userData) {
    return (
      <>
        <div
          className={`fixed inset-0 z-50 bg-white transition-opacity duration-500 ${
            loadingPhase === 'fadeOut' ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <LoadingBar
            key={`${currentStep}-${locationState.status}-${locationState.verificationStatus}`}
            step={currentStep}
            locationState={locationState}
            onLocationRetry={handleLocationRetry}
            onRequestAdminAssistance={handleRequestAdminAssistance} // Pass the handler
          />
        </div>
        <div className="opacity-0">{mainContent}</div>
      </>
    );
  }

  // Ensure we have the required props
  if (!safeAttendanceProps) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-red-500 font-medium mb-4">
            ข้อมูลไม่ครบถ้วน กรุณาลองใหม่อีกครั้ง
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
    );
  }

  // Show check-in form (default view)
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

      <CheckInOutForm
        userData={userData}
        onComplete={closeWindow}
        {...attendanceProps}
      />
    </div>
  );
};

export default React.memo(CheckInRouter);
