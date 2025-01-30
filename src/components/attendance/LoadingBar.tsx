import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LocationState } from '@/types/attendance';

interface LoadingBarProps {
  step: 'auth' | 'user' | 'location' | 'ready';
  locationState: LocationState;
  onLocationRetry?: () => Promise<void>;
  onRequestAdminAssistance?: () => Promise<void>;
}

const LoadingBar: React.FC<LoadingBarProps> = ({
  step,
  locationState,
  onLocationRetry,
  onRequestAdminAssistance,
}) => {
  const [progress, setProgress] = useState(0);
  const [isRequestingHelp, setIsRequestingHelp] = useState(false);

  // Function to calculate error state based on locationState
  const getErrorState = (locationState: LocationState) => {
    // Only show location errors when we're on location step
    if (step !== 'location') {
      return {
        shouldShowError: false,
        shouldShowAdminAssistance: false,
        shouldShowAdminPending: false,
        errorMessage: null,
      };
    }

    const hasError = Boolean(
      locationState.status === 'error' ||
        locationState.error ||
        locationState.verificationStatus === 'needs_verification' ||
        locationState.triggerReason === 'Location permission denied',
    );

    const isAdminPending =
      locationState.verificationStatus === 'admin_pending' ||
      locationState.status === 'waiting_admin' ||
      locationState.status === 'pending_admin';

    let errorMessage = locationState.error;
    if (!errorMessage && hasError) {
      if (locationState.status === 'error') {
        errorMessage = 'เกิดข้อผิดพลาดในการระบุตำแหน่ง';
      } else if (locationState.verificationStatus === 'needs_verification') {
        errorMessage = 'ต้องการการยืนยันตำแหน่ง';
      } else if (locationState.triggerReason === 'Location permission denied') {
        errorMessage = 'ไม่สามารถเข้าถึงตำแหน่งได้ กรุณาเปิดการใช้งานตำแหน่ง';
      }
    }

    return {
      shouldShowError: hasError && !isAdminPending,
      shouldShowAdminAssistance: hasError && !isAdminPending,
      shouldShowAdminPending: isAdminPending,
      errorMessage: isAdminPending ? null : errorMessage,
    };
  };

  // Update progress bar based on step sequence
  useEffect(() => {
    const { shouldShowError } = getErrorState(locationState);
    const target = { auth: 25, user: 50, location: 75, ready: 100 }[step];

    // Reset progress if we have a location error
    if (shouldShowError && step === 'location') {
      setProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 1, target));
    }, 30);

    return () => clearInterval(interval);
  }, [step, locationState]);

  // Handle admin assistance request
  const handleRequestAssistance = async () => {
    if (!onRequestAdminAssistance) {
      console.warn('Admin assistance handler not provided');
      return;
    }

    try {
      setIsRequestingHelp(true);
      await onRequestAdminAssistance();
    } catch (error) {
      console.error('Admin assistance request failed:', error);
    } finally {
      setIsRequestingHelp(false);
    }
  };

  // Steps configuration - matches the sequence
  const steps = {
    auth: {
      message: 'ตรวจสอบสิทธิ์การเข้างาน',
      color: 'bg-yellow-500',
      icon: <i className="fi fi-rs-key"></i>,
    },
    user: {
      message: 'โหลดข้อมูลพนักงาน',
      color: 'bg-yellow-500',
      icon: <i className="fi fi-br-user"></i>,
    },
    location: {
      message:
        locationState.verificationStatus === 'admin_pending' ||
        locationState.status === 'waiting_admin' ||
        locationState.status === 'pending_admin'
          ? 'รอการยืนยันตำแหน่ง'
          : 'ตรวจสอบตำแหน่ง',
      color: 'bg-orange-500',
      icon: <i className="fi fi-br-map-pin"></i>,
    },
    ready: {
      message: 'เตรียมระบบบันทึกเวลา',
      color: 'bg-red-500',
      icon: <i className="fi fi-br-time-check"></i>,
    },
  };

  const currentStep = steps[step];

  // Enhanced error UI rendering - only show on location step
  const renderLocationStatus = () => {
    const {
      shouldShowError,
      shouldShowAdminAssistance,
      shouldShowAdminPending,
      errorMessage,
    } = getErrorState(locationState);

    if (step !== 'location') return null;

    if (shouldShowAdminPending) {
      return (
        <div className="mt-6 space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              รอการยืนยันจากเจ้าหน้าที่
              {locationState.triggerReason && (
                <p className="text-sm mt-1 text-gray-600">
                  เหตุผล: {locationState.triggerReason}
                </p>
              )}
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    if (!shouldShowError) return null;

    return (
      <div className="mt-6 space-y-4">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col space-y-2">
          {onLocationRetry && (
            <button
              type="button"
              onClick={onLocationRetry}
              className="w-full px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
            >
              ลองใหม่อีกครั้ง
            </button>
          )}
          {shouldShowAdminAssistance && onRequestAdminAssistance && (
            <button
              type="button"
              onClick={handleRequestAssistance}
              disabled={isRequestingHelp}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <i className="fi fi-br-phone-call text-sm"></i>
              {isRequestingHelp
                ? 'กำลังส่งคำขอ...'
                : 'ขอความช่วยเหลือจากเจ้าหน้าที่'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white">
      <div className="w-full max-w-xs text-center px-6">
        <div
          className={`text-6xl mb-8 ${
            step === 'location' && locationState.status === 'loading'
              ? 'animate-bounce'
              : ''
          }`}
        >
          {currentStep.icon}
        </div>

        <div className="mb-4">
          <div className="mb-2 text-xl font-semibold text-gray-700">
            {progress}%
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${currentStep.color}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="text-gray-700 font-medium">{currentStep.message}</div>
        {renderLocationStatus()}
      </div>
    </div>
  );
};

export default LoadingBar;
