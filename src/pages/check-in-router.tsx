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

    console.log('Processing attendance records:', {
      base: safeAttendanceProps.base,
      periodState: safeAttendanceProps.periodState,
    });

    const records: Array<{
      record: AttendanceRecord;
      periodSequence: number;
    }> = [];

    // Extract records function
    const extractRecords = (): AttendanceRecord[] => {
      const extractedRecords: AttendanceRecord[] = [];
      const attendance = safeAttendanceProps.base.latestAttendance;

      if (attendance) {
        // Handle regular period
        if (!attendance.isOvertime) {
          extractedRecords.push({
            ...attendance,
            type: PeriodType.REGULAR,
            periodSequence: 1,
          });
        }

        // Handle overtime period
        if (attendance.isOvertime || attendance.type === PeriodType.OVERTIME) {
          extractedRecords.push({
            ...attendance,
            type: PeriodType.OVERTIME,
            periodSequence: attendance.isOvertime ? 2 : 1,
          });
        }
      }

      console.log('Extracted records:', extractedRecords);
      return extractedRecords;
    };

    // Get and sort all records
    const allRecords = extractRecords().sort((a, b) => {
      // Sort by type first (REGULAR before OVERTIME)
      if (a.type !== b.type) {
        return a.type === PeriodType.REGULAR ? -1 : 1;
      }
      // Then by sequence
      return (a.periodSequence || 0) - (b.periodSequence || 0);
    });

    // Process records
    allRecords.forEach((record) => {
      records.push({
        record: {
          ...record,
          metadata: record.metadata || {
            isManualEntry: false,
            isDayOff: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            source: 'system',
          },
        },
        periodSequence: record.periodSequence || 1,
      });
    });

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
