import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { UserData } from '@/types/user';
import CheckInOutForm from '@/components/attendance/CheckInOutForm';
import { closeWindow } from '@/services/liff';
import LoadingBar from '@/components/attendance/LoadingBar';

type Step = 'auth' | 'user' | 'location' | 'ready';
type LoadingPhase = 'loading' | 'fadeOut' | 'complete';

const validateISODate = (
  dateString: string | null | undefined,
): string | null => {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : dateString;
  } catch {
    return null;
  }
};

const isValidTimeString = (timeStr: string | null | undefined): boolean => {
  if (!timeStr) return false;
  try {
    return (
      /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr) || // HH:mm
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(timeStr)
    ); // ISO format
  } catch {
    return false;
  }
};

const createSafeAttendance = (props: any) => {
  if (!props) {
    console.warn('No attendance props provided');
    return null;
  }

  try {
    // Only process if we have real data
    if (!props.base?.state || !props.context?.shift?.id) {
      console.log('No valid attendance data yet');
      return null;
    }

    console.log('Processing attendance data:', {
      state: props.base.state,
      shiftId: props.context.shift.id,
      hasTransitions: props.transitions?.length > 0,
    });

    // Create safe return object
    return {
      ...props,
      // Ensure transitions are properly handled
      transitions: Array.isArray(props.transitions) ? props.transitions : [],
      hasPendingTransition: Boolean(
        props.transitions?.length > 0 ||
          props.context?.transition?.isInTransition,
      ),
      // Ensure context is complete
      context: {
        ...props.context,
        schedule: {
          isHoliday: Boolean(props.context.schedule?.isHoliday),
          isDayOff: Boolean(props.context.schedule?.isDayOff),
          isAdjusted: Boolean(props.context.schedule?.isAdjusted),
          holidayInfo: props.context.schedule?.holidayInfo,
        },
      },
    };
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

  // Debug effect for data flow
  useEffect(() => {
    console.group('CheckInRouter State');
    console.log('Current Step:', currentStep);
    console.log('Loading Phase:', loadingPhase);
    console.log('User Data:', userData);
    console.log('Line User ID:', lineUserId);
    console.log('Is Initialized:', isInitialized);
    console.groupEnd();
  }, [currentStep, loadingPhase, userData, lineUserId, isInitialized]);

  // User data fetching
  const fetchUserData = useCallback(async () => {
    if (!lineUserId || authLoading || !isInitialized) return;

    try {
      setCurrentStep('user');
      const response = await fetch('/api/user-data', {
        headers: { 'x-line-userid': lineUserId },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();
      if (!data?.user) {
        throw new Error('No user data received');
      }

      setUserData(data.user);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to fetch user data',
      );
    }
  }, [lineUserId, authLoading, isInitialized]);

  // Initial data fetch
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Attendance hook with error boundary
  const {
    locationReady,
    locationState,
    isLoading: attendanceLoading,
    error: attendanceError,
    ...attendanceProps
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId: lineUserId || '',
    enabled: Boolean(userData?.employeeId && !authLoading),
  });

  // Process attendance props safely
  const safeAttendanceProps = useMemo(() => {
    console.log('Processing attendance props:', attendanceProps);
    return createSafeAttendance(attendanceProps);
  }, [attendanceProps]);

  // Step management
  useEffect(() => {
    try {
      if (authLoading) {
        setCurrentStep('auth');
      } else if (!userData) {
        setCurrentStep('user');
      } else if (!locationReady || !locationState?.status) {
        setCurrentStep('location');
      } else if (safeAttendanceProps) {
        setCurrentStep('ready');
      }
    } catch (error) {
      console.error('Error updating step:', error);
      setError('Error initializing application');
    }
  }, [
    authLoading,
    userData,
    locationReady,
    locationState?.status,
    safeAttendanceProps,
  ]);

  // System ready state
  const isSystemReady = useMemo(
    () =>
      Boolean(
        currentStep === 'ready' &&
          !attendanceLoading &&
          locationState?.status === 'ready' &&
          userData &&
          safeAttendanceProps,
      ),
    [
      currentStep,
      attendanceLoading,
      locationState?.status,
      userData,
      safeAttendanceProps,
    ],
  );

  // Loading phase management
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isSystemReady) {
      if (loadingPhase === 'loading') {
        setLoadingPhase('fadeOut');
      } else if (loadingPhase === 'fadeOut') {
        timer = setTimeout(() => setLoadingPhase('complete'), 500);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isSystemReady, loadingPhase]);

  // Main content rendering
  const mainContent = useMemo(() => {
    if (!userData || !safeAttendanceProps) return null;

    return (
      <div className="min-h-screen flex flex-col bg-gray-50 transition-opacity duration-300">
        <CheckInOutForm
          userData={userData}
          onComplete={closeWindow}
          {...safeAttendanceProps}
        />
      </div>
    );
  }, [userData, safeAttendanceProps]);

  // Error handling
  if (error || attendanceError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error || attendanceError}</AlertDescription>
      </Alert>
    );
  }

  // Invalid data handling
  if (attendanceProps && !safeAttendanceProps) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Invalid attendance data format</AlertDescription>
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

  return mainContent;
};

export default React.memo(CheckInRouter);
