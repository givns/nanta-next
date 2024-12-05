import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import LoadingBar from '@/components/LoadingBar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { UserData } from '@/types/user';
import CheckInOutForm from '@/components/attendance/CheckInOutForm';
import { closeWindow } from '@/services/liff';

// Define a proper loading state interface
interface LoadingState {
  auth: boolean;
  userData: boolean;
  location: boolean;
  attendance: boolean;
}

const CheckInRouter: React.FC = () => {
  // Core states
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    auth: true,
    userData: true,
    location: true,
    attendance: true,
  });

  // Core hooks
  const { lineUserId, isInitialized } = useLiff();
  const { isLoading: authLoading } = useAuth({ required: true });

  // Update loading state utility
  const updateLoadingState = useCallback(
    (key: keyof LoadingState, value: boolean) => {
      setLoadingState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Fetch user data
  useEffect(() => {
    let mounted = true;

    const fetchUserData = async () => {
      if (!lineUserId || authLoading || !isInitialized) return;

      try {
        updateLoadingState('userData', true);
        const response = await fetch('/api/user-data', {
          headers: { 'x-line-userid': lineUserId },
        });

        if (!response.ok) throw new Error('Failed to fetch user data');
        const data = await response.json();

        if (!mounted) return;

        if (data?.user) {
          console.log('User data received:', data.user);
          setUserData(data.user);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError('Failed to fetch user data');
      } finally {
        if (mounted) {
          updateLoadingState('userData', false);
        }
      }
    };

    fetchUserData();
    return () => {
      mounted = false;
    };
  }, [lineUserId, authLoading, isInitialized, updateLoadingState]);

  // Initialize attendance tracking
  const {
    locationReady,
    locationState,
    isLoading: attendanceLoading,
    error: attendanceError,
    ...attendanceProps
  } = useSimpleAttendance({
    employeeId: userData?.employeeId,
    lineUserId,
    enabled: Boolean(
      userData?.employeeId && !loadingState.userData && !authLoading,
    ),
  });

  // Update loading states based on dependencies
  useEffect(() => {
    updateLoadingState('auth', authLoading);
    updateLoadingState('location', !locationReady);
    updateLoadingState('attendance', attendanceLoading);
  }, [authLoading, locationReady, attendanceLoading, updateLoadingState]);

  // Determine if system is ready
  const isSystemReady = !Object.values(loadingState).some(Boolean);

  // Loading view
  if (!isSystemReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <LoadingBar />
        <p className="mt-4 text-gray-600">
          {loadingState.auth
            ? 'กำลังตรวจสอบสิทธิ์...'
            : loadingState.userData
              ? 'กำลังโหลดข้อมูลผู้ใช้...'
              : loadingState.location
                ? 'กำลังตรวจสอบตำแหน่ง...'
                : 'กำลังโหลดข้อมูล...'}
        </p>
      </div>
    );
  }

  // Error states
  if (error || attendanceError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error || attendanceError}</AlertDescription>
      </Alert>
    );
  }

  // Main render
  return (
    <div className="min-h-screen flex flex-col bg-gray-300">
      {userData && (
        <CheckInOutForm userData={userData} onComplete={closeWindow} />
      )}
    </div>
  );
};

export default React.memo(CheckInRouter);
