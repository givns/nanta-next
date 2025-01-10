import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  SerializedAttendanceRecord,
} from '@/types/attendance';
import { useNextDayInfo } from '@/hooks/useNextDayInfo';
import { LoadingSpinner } from '@/components/LoadingSpinnner';
import TodaySummary from '@/components/attendance/TodaySummary';
import NextDayInfo from '@/components/attendance/NextDayInformation';

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
    // Only proceed if we have valid base data
    if (!props.base?.state || !props.context?.shift?.id) {
      console.log('Missing required base data');
      return null;
    }

    // Create a copy of props without modification
    const safeProps = {
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

    console.log('Safe attendance created:', safeProps);
    return safeProps;
  } catch (error) {
    console.error('Error creating safe attendance:', error);
    return null;
  }
};

const CheckInRouter: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('auth');
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('loading');
  const [showNextDay, setShowNextDay] = useState(false);
  const { lineUserId, isInitialized } = useLiff();
  const { isLoading: authLoading } = useAuth({ required: true });

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

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Get attendance data
  const {
    locationReady,
    locationState = { status: null },
    isLoading: attendanceLoading,
    error: attendanceError,
    ...attendanceProps
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId: lineUserId || '',
    enabled: Boolean(userData?.employeeId && !authLoading),
  });

  // Process attendance props
  const safeAttendanceProps = useMemo(() => {
    if (!attendanceProps) return null;
    return createSafeAttendance(attendanceProps);
  }, [attendanceProps]);

  const dailyRecords = useMemo(() => {
    if (!safeAttendanceProps?.base) return [];

    try {
      // Get latest and additional records
      const attendance = safeAttendanceProps.base.latestAttendance;
      const additionalRecords =
        safeAttendanceProps.base.additionalRecords || [];

      // Combine all records
      const allRecords = [...additionalRecords];
      if (
        attendance &&
        !additionalRecords.find(
          (record: AttendanceRecord) => record.id === attendance.id,
        )
      ) {
        allRecords.push(attendance);
      }

      // Sort regular period first, then overtime by sequence
      const sortedRecords = allRecords.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === PeriodType.REGULAR ? -1 : 1;
        }
        return (
          new Date(a.CheckInTime || 0).getTime() -
          new Date(b.CheckInTime || 0).getTime()
        );
      });

      // Map to final format
      return sortedRecords.map((record, index) => ({
        record,
        periodSequence: index + 1,
      }));
    } catch (error) {
      console.error('Error processing daily records:', error);
      return [];
    }
  }, [safeAttendanceProps?.base]);

  const isAllPeriodsCompleted = useMemo(() => {
    if (!safeAttendanceProps?.base) return false;

    try {
      const base = safeAttendanceProps.base;

      // Find both regular and overtime records
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

      // Debug logging
      console.log('Completion check:', {
        regularRecord: {
          exists: !!regularRecord,
          checkOut: regularRecord?.record.CheckOutTime,
          state: regularRecord?.record.state,
          overtimeState: regularRecord?.record.overtimeState,
        },
        overtimeRecord: {
          exists: !!overtimeRecord,
          checkOut: overtimeRecord?.record.CheckOutTime,
          state: overtimeRecord?.record.state,
          overtimeState: overtimeRecord?.record.overtimeState,
        },
        baseState: {
          checkStatus: base.checkStatus,
          state: base.state,
        },
      });

      // Both periods must be complete
      const isComplete = Boolean(
        // Regular period completed
        regularRecord?.record.CheckOutTime &&
          regularRecord.record.state === 'PRESENT' &&
          regularRecord.record.overtimeState === 'COMPLETED' &&
          // Overtime period completed (if exists)
          (!overtimeRecord ||
            (overtimeRecord.record.CheckOutTime &&
              overtimeRecord.record.state === 'PRESENT' &&
              overtimeRecord.record.overtimeState === 'COMPLETED')),
      );

      return isComplete;
    } catch (error) {
      console.error('Error checking period completion:', error);
      return false;
    }
  }, [safeAttendanceProps?.base, dailyRecords]);

  // System ready state
  const isSystemReady = useMemo(() => {
    const conditions = {
      stepIsReady: currentStep === 'ready',
      notLoading: !attendanceLoading,
      locationReady: locationState?.status === 'ready',
      hasUser: !!userData,
      hasAttendanceState: !!safeAttendanceProps?.base?.state,
    };
    return Object.values(conditions).every(Boolean);
  }, [
    currentStep,
    attendanceLoading,
    locationState?.status,
    userData,
    safeAttendanceProps,
  ]);

  // Loading phase management
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSystemReady) {
      if (loadingPhase === 'loading') {
        setLoadingPhase('fadeOut');
      } else if (loadingPhase === 'fadeOut') {
        timer = setTimeout(() => {
          setLoadingPhase('complete');
        }, 500);
      }
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isSystemReady, loadingPhase]);

  // Step management
  useEffect(() => {
    try {
      let nextStep: Step = 'auth';
      if (!userData) {
        nextStep = 'user';
      } else if (!locationState || locationState.status !== 'ready') {
        nextStep = 'location';
      } else if (authLoading) {
        nextStep = 'auth';
      } else {
        nextStep = 'ready';
      }
      setCurrentStep(nextStep);
    } catch (error) {
      console.error('Error updating step:', error);
      setError('Error initializing application');
    }
  }, [authLoading, userData, locationReady, locationState]);

  // Only fetch next day info when needed
  const { nextDayInfo } = useNextDayInfo(
    userData?.employeeId,
    Boolean(isAllPeriodsCompleted),
  );

  const mainContent = useMemo(() => {
    if (!userData || !safeAttendanceProps?.base?.state) return null;

    console.log(
      'Daily Records Raw:',
      dailyRecords.map((r) => ({
        dateType: typeof r.record.date,
        checkInType: typeof r.record.CheckInTime,
        shiftStartType: typeof r.record.shiftStartTime,
      })),
    );

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
        console.log('Debug nextDayProps:', {
          hasOvertimeInfo: Boolean(safeAttendanceProps?.context?.overtimeInfo),
          overtimeInfo: safeAttendanceProps?.context?.overtimeInfo,
        });
        return (
          <NextDayInfo
            nextDayInfo={{
              isHoliday: safeAttendanceProps.context.schedule.isHoliday,
              holidayInfo: safeAttendanceProps.context.schedule.holidayInfo,
              isDayOff: safeAttendanceProps.context.schedule.isDayOff,
              shift: {
                id: safeAttendanceProps.context.shift.id,
                name: safeAttendanceProps.context.shift.name,
                startTime: safeAttendanceProps.context.shift.startTime,
                endTime: safeAttendanceProps.context.shift.endTime,
                isAdjusted: safeAttendanceProps.context.schedule.isAdjusted,
                adjustedInfo:
                  safeAttendanceProps.context.schedule.adjustedShiftInfo,
              },
              overtime: safeAttendanceProps.context.overtimeInfo,
            }}
            onClose={() => setShowNextDay(false)}
          />
        );
      }

      // Show today's summary
      return (
        <TodaySummary
          userData={userData}
          records={serializeRecords(dailyRecords)}
          onViewNextDay={() => setShowNextDay(true)}
          onClose={closeWindow}
        />
      );
    }

    // Show check-in form
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
    nextDayInfo,
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
  if (loadingPhase !== 'complete') {
    return (
      <>
        <div
          className={`fixed inset-0 z-50 bg-white transition-opacity duration-500 ${
            loadingPhase === 'fadeOut' ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <LoadingBar step={currentStep} />
        </div>
        <div className="opacity-0">{mainContent}</div>
      </>
    );
  }

  // Render main content
  return mainContent;
};

export default React.memo(CheckInRouter);
