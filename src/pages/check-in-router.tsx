import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { UserData } from '@/types/user';
import CheckInOutForm from '@/components/attendance/CheckInOutForm';
import { closeWindow } from '@/services/liff';
import LoadingBar from '@/components/attendance/LoadingBar';

const CheckInRouter: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<
    'auth' | 'user' | 'location' | 'ready'
  >('auth');
  const [loadingPhase, setLoadingPhase] = useState<
    'initial' | 'transition' | 'complete'
  >('initial');

  const { lineUserId, isInitialized } = useLiff();
  const { isLoading: authLoading } = useAuth({ required: true });

  const fetchUserData = useCallback(async () => {
    if (!lineUserId || authLoading || !isInitialized) return;

    try {
      setCurrentStep('user');
      const response = await fetch('/api/user-data', {
        headers: { 'x-line-userid': lineUserId },
      });

      if (!response.ok) throw new Error('Failed to fetch user data');
      const data = await response.json();

      if (data?.user) {
        setUserData(data.user);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to fetch user data');
    }
  }, [lineUserId, authLoading, isInitialized]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const {
    locationReady,
    locationState,
    isLoading: attendanceLoading,
    error: attendanceError,
    ...attendanceProps
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId,
    enabled: Boolean(userData?.employeeId && !authLoading),
  });

  useEffect(() => {
    if (authLoading) setCurrentStep('auth');
    else if (!userData) setCurrentStep('user');
    else if (!locationReady) setCurrentStep('location');
    else setCurrentStep('ready');
  }, [authLoading, userData, locationReady]);

  const isSystemReady = currentStep === 'ready' && !attendanceLoading;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSystemReady) {
      setLoadingPhase('transition');
      timer = setTimeout(() => setLoadingPhase('complete'), 500);
    }
    return () => clearTimeout(timer);
  }, [isSystemReady]);

  if (loadingPhase !== 'complete') {
    return (
      <div
        className={`fixed inset-0 flex flex-col items-center justify-center bg-white transition-opacity duration-500 ${
          loadingPhase === 'transition' ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <LoadingBar step={currentStep} />
      </div>
    );
  }

  if (error || attendanceError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error || attendanceError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {userData && (
        <CheckInOutForm userData={userData} onComplete={closeWindow} />
      )}
    </div>
  );
};

export default React.memo(CheckInRouter);
