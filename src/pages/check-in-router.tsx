import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { UserData } from '@/types/user';
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import CheckInOutForm from '@/components/attendance/CheckInOutForm';
import DailyAttendanceSummary from '@/components/attendance/DailyAttendanceSummary';
import { closeWindow } from '@/services/liff';
import LoadingBar from '@/components/attendance/LoadingBar';
import { AttendanceRecord } from '@/types/attendance';

type Step = 'auth' | 'user' | 'location' | 'ready';
type LoadingPhase = 'loading' | 'fadeOut' | 'complete';

interface MongoDate {
  $date: string;
}

interface MongoId {
  $oid: string;
}

interface MongoLong {
  $numberLong: string;
}

interface TimeEntry {
  _id: MongoId;
  employeeId: string;
  date: MongoDate;
  startTime: MongoDate;
  endTime?: MongoDate;
  status: 'COMPLETED' | string;
  entryType: PeriodType;
  regularHours: number;
  overtimeHours: number;
  attendanceId: MongoId;
  overtimeRequestId?: MongoId;
  hours: {
    regular: number;
    overtime: number;
  };
  timing: {
    actualMinutesLate: number;
    isHalfDayLate: boolean;
  };
  metadata: {
    source: string;
    version: number;
    createdAt?: string;
    updatedAt: string;
  };
  actualMinutesLate: MongoLong;
  isHalfDayLate: boolean;
  createdAt: MongoDate;
  updatedAt: MongoDate;
}

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

  // Check if all periods are completed
  const isAllPeriodsCompleted = useMemo(() => {
    if (!safeAttendanceProps?.base) return false;

    const base = safeAttendanceProps.base;
    const currentState = safeAttendanceProps.periodState;

    // Check multiple conditions
    const isRegularComplete =
      base.checkStatus === CheckStatus.CHECKED_OUT &&
      base.state === AttendanceState.PRESENT;

    const isNoTransitionPending = !safeAttendanceProps.hasPendingTransition;

    // For overtime periods
    const isOvertimeComplete = base.periodInfo.isOvertime
      ? base.periodInfo.overtimeState === 'COMPLETED'
      : true;

    const hasCompletedCurrentPeriod = Boolean(currentState?.activity.checkOut);

    console.log('Completion check:', {
      isRegularComplete,
      isNoTransitionPending,
      isOvertimeComplete,
      hasCompletedCurrentPeriod,
    });

    return (
      isRegularComplete &&
      isNoTransitionPending &&
      isOvertimeComplete &&
      hasCompletedCurrentPeriod
    );
  }, [safeAttendanceProps]);

  const dailyRecords = useMemo(() => {
    if (!safeAttendanceProps?.base) return [];

    const records: Array<{
      record: AttendanceRecord;
      periodSequence: number;
    }> = [];

    const extractRecords = (): AttendanceRecord[] => {
      const extractedRecords: AttendanceRecord[] = [];
      const attendance = safeAttendanceProps.base.latestAttendance;

      if (!attendance?.timeEntries?.length) return extractedRecords;

      // Get regular period
      const regularEntry = attendance.timeEntries.find(
        (entry: TimeEntry) =>
          entry.entryType === PeriodType.REGULAR &&
          entry.status === 'COMPLETED',
      );

      if (regularEntry) {
        console.log('Processing regular entry:', regularEntry);
        extractedRecords.push({
          ...attendance,
          id: regularEntry.attendanceId.$oid,
          employeeId: regularEntry.employeeId,
          type: PeriodType.REGULAR,
          periodSequence: 1,
          isOvertime: false,
          // Use exact times from timeEntry
          CheckInTime: new Date(regularEntry.startTime.$date),
          CheckOutTime: regularEntry.endTime
            ? new Date(regularEntry.endTime.$date)
            : null,
          // Shift times
          shiftStartTime: new Date(regularEntry.startTime.$date),
          shiftEndTime: regularEntry.endTime
            ? new Date(regularEntry.endTime.$date)
            : null,
          // Other metadata
          checkTiming: {
            isEarlyCheckIn: false,
            isLateCheckIn:
              parseInt(regularEntry.actualMinutesLate.$numberLong) > 0,
            isLateCheckOut: false,
            isVeryLateCheckOut: false,
            lateCheckInMinutes: parseInt(
              regularEntry.actualMinutesLate.$numberLong,
            ),
            lateCheckOutMinutes: 0,
          },
        });
      }

      // Get overtime entries
      const overtimeEntries = attendance.timeEntries.filter(
        (entry: TimeEntry) =>
          entry.entryType === PeriodType.OVERTIME &&
          entry.status === 'COMPLETED',
      );

      overtimeEntries.forEach((entry: TimeEntry, index: number) => {
        console.log('Processing overtime entry:', entry);
        extractedRecords.push({
          ...attendance,
          id: entry.attendanceId.$oid,
          employeeId: entry.employeeId,
          type: PeriodType.OVERTIME,
          periodSequence: index + 1,
          isOvertime: true,
          // Use exact times from timeEntry
          CheckInTime: new Date(entry.startTime.$date),
          CheckOutTime: entry.endTime ? new Date(entry.endTime.$date) : null,
          // For overtime, use the same time for shift
          shiftStartTime: new Date(entry.startTime.$date),
          shiftEndTime: entry.endTime ? new Date(entry.endTime.$date) : null,
          // Overtime specific fields
          overtimeId: entry.overtimeRequestId?.$oid,
          overtimeDuration: entry.overtimeHours,
          checkTiming: {
            isEarlyCheckIn: false,
            isLateCheckIn: parseInt(entry.actualMinutesLate.$numberLong) > 0,
            isLateCheckOut: false,
            isVeryLateCheckOut: false,
            lateCheckInMinutes: parseInt(entry.actualMinutesLate.$numberLong),
            lateCheckOutMinutes: 0,
          },
        });
      });

      return extractedRecords;
    };

    const allRecords = extractRecords().sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === PeriodType.REGULAR ? -1 : 1;
      }
      return (a.periodSequence || 0) - (b.periodSequence || 0);
    });

    allRecords.forEach((record) => {
      records.push({
        record,
        periodSequence: record.periodSequence,
      });
    });

    console.log(
      'Final processed records:',
      records.map((r) => ({
        type: r.record.type,
        sequence: r.periodSequence,
        times: {
          checkIn: r.record.CheckInTime,
          checkOut: r.record.CheckOutTime,
        },
      })),
    );

    return records;
  }, [safeAttendanceProps]);

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

  // Main content
  const mainContent = useMemo(() => {
    if (!userData || !safeAttendanceProps?.base?.state) return null;

    // Show summary if all periods completed
    if (isAllPeriodsCompleted) {
      return (
        <div className="min-h-screen flex flex-col bg-gray-50 transition-opacity duration-300">
          <DailyAttendanceSummary
            userData={userData}
            records={dailyRecords}
            onClose={closeWindow}
          />
        </div>
      );
    }

    // Show check-in form
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 transition-opacity duration-300">
        <CheckInOutForm
          userData={userData}
          onComplete={closeWindow}
          {...safeAttendanceProps}
        />
      </div>
    );
  }, [userData, safeAttendanceProps, isAllPeriodsCompleted, dailyRecords]);

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
