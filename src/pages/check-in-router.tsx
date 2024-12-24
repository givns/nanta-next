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
        // Handle any date fields that need parsing
        updatedAt: data.user.updatedAt
          ? new Date(data.user.updatedAt)
          : undefined,
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
    locationState,
    isLoading: attendanceLoading,
    error: attendanceError,
    ...attendanceProps
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId: lineUserId || '',
    enabled: Boolean(userData?.employeeId && !authLoading),
  });

  // Debug logging (consider removing in production)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Location state:', { locationReady, locationState });
      console.log('Attendance state:', {
        attendanceLoading,
        attendanceError,
        currentStep,
        loadingPhase,
        userData: userData?.employeeId,
      });
    }
  }, [
    locationReady,
    locationState,
    attendanceLoading,
    attendanceError,
    currentStep,
    loadingPhase,
    userData,
  ]);

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
          <CheckInOutForm userData={userData} onComplete={closeWindow} />
        )}
      </div>
    ),
    [userData],
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
