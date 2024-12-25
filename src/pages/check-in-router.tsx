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

const CheckInRouter: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('auth');
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('loading');

  const { lineUserId, isInitialized } = useLiff();
  const { isLoading: authLoading } = useAuth({ required: true });

  const validateDate = (
    dateString: string | null | undefined,
  ): Date | undefined => {
    if (!dateString) return undefined;
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? undefined : date;
    } catch (error) {
      console.error('Date validation error:', error);
      return undefined;
    }
  };
  const validateTime = (timeStr: string | null | undefined): string => {
    if (!timeStr || timeStr === '') return '--:--';
    try {
      // Validate time string format HH:mm
      if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)) {
        return timeStr;
      }
      return '--:--';
    } catch {
      return '--:--';
    }
  };

  const validateISODate = (dateStr: string | null | undefined): string => {
    if (!dateStr || dateStr === '') return '';
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? '' : dateStr;
    } catch {
      return '';
    }
  };

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

      // Transform dates in user data if needed
      const transformedUser = {
        ...data.user,
        // Use validateDate for all date fields
        updatedAt: validateDate(data.user.updatedAt),
        // Add other date fields that need validation
        checkInTime: validateDate(data.user.checkInTime),
        checkOutTime: validateDate(data.user.checkOutTime),
        shiftStartTime: validateDate(data.user.shiftStartTime),
        shiftEndTime: validateDate(data.user.shiftEndTime),
      };

      setUserData(transformedUser);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to fetch user data',
      );
    }
  }, [lineUserId, authLoading, isInitialized]);

  // Attendance hook with error boundary
  const {
    locationReady,
    locationState = { status: null }, // Add default value
    isLoading: attendanceLoading,
    error: attendanceError,
    ...attendanceProps
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId: lineUserId || '',
    enabled: Boolean(userData?.employeeId && !authLoading),
  });

  useEffect(() => {
    console.group('CheckInRouter Debug');
    console.log('Current Step:', currentStep);
    console.log('Loading Phase:', loadingPhase);
    console.log('User Data:', userData);
    console.log('Location State:', locationState);
    console.log('Attendance Props:', attendanceProps);
    console.groupEnd();
  }, [currentStep, loadingPhase, userData, locationState, attendanceProps]);

  // Initial data fetch
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Step management
  useEffect(() => {
    try {
      if (authLoading) setCurrentStep('auth');
      else if (!userData) setCurrentStep('user');
      else if (!locationReady || !locationState.status)
        setCurrentStep('location');
      else setCurrentStep('ready');
    } catch (error) {
      console.error('Error updating step:', error);
      setError('Error initializing application');
    }
  }, [authLoading, userData, locationReady, locationState.status]);

  const safeAttendance = useMemo(() => {
    if (!attendanceProps) return null;

    return {
      ...attendanceProps,
      periodState: {
        ...attendanceProps.periodState,
        timeWindow: {
          start: validateISODate(attendanceProps.periodState.timeWindow.start),
          end: validateISODate(attendanceProps.periodState.timeWindow.end),
        },
      },
      shift: attendanceProps.shift && {
        ...attendanceProps.shift,
        startTime: validateTime(attendanceProps.shift.startTime),
        endTime: validateTime(attendanceProps.shift.endTime),
      },
      base: {
        ...attendanceProps.base,
        metadata: {
          ...attendanceProps.base.metadata,
          lastUpdated: validateISODate(
            attendanceProps.base.metadata.lastUpdated,
          ),
        },
      },
    };
  }, [attendanceProps]);

  // System ready state
  const isSystemReady = useMemo(
    () =>
      currentStep === 'ready' &&
      !attendanceLoading &&
      locationState.status === 'ready' &&
      userData !== null,
    [currentStep, attendanceLoading, locationState.status, userData],
  );

  // Loading phase management
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSystemReady && loadingPhase === 'loading') {
      setLoadingPhase('fadeOut');
      timer = setTimeout(() => {
        setLoadingPhase('complete');
      }, 500);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isSystemReady, loadingPhase]);

  // Main content
  const mainContent = useMemo(
    () => (
      <div className="min-h-screen flex flex-col bg-gray-50 transition-opacity duration-300">
        {userData && (
          <CheckInOutForm
            userData={userData}
            onComplete={closeWindow}
            {...safeAttendance} // Spread the safe attendance props
          />
        )}
      </div>
    ),
    [userData, safeAttendance],
  );

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

  return mainContent;
};

export default React.memo(CheckInRouter);
