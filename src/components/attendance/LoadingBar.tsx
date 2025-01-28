import React, { useState, useEffect, useMemo } from 'react';
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

  console.log('LoadingBar render with:', {
    receivedState: locationState,
    step,
    handlers: {
      hasRetry: !!onLocationRetry,
      hasAdmin: !!onRequestAdminAssistance,
    },
  });

  useEffect(() => {
    console.log('LoadingBar state dependencies changed:', {
      step,
      locationState,
    });
  }, [step, locationState]);

  const { shouldShowError, shouldShowAdminAssistance } = useMemo(() => {
    // Log for debugging
    console.log('Detailed error evaluation:', {
      status: locationState.status,
      error: locationState.error,
      verificationStatus: locationState.verificationStatus,
      triggerReason: locationState.triggerReason,
    });

    // Consolidated error state evaluation
    const hasError =
      locationState.status === 'error' || Boolean(locationState.error);

    const needsVerification =
      locationState.verificationStatus === 'needs_verification';

    const isPermissionDenied =
      locationState.triggerReason === 'Location permission denied' ||
      locationState.error?.includes('ถูกปิดกั้น') ||
      false;

    return {
      // Show error UI for any error condition or when verification is needed
      shouldShowError: hasError || needsVerification,
      // Show admin assistance for permission denied or verification needed
      shouldShowAdminAssistance:
        needsVerification || isPermissionDenied || hasError,
    };
  }, [locationState]);

  // Update progress bar logic
  useEffect(() => {
    if (locationState.status === 'error') {
      setProgress(0);
      return;
    }

    const target = { auth: 25, user: 50, location: 75, ready: 100 }[step];
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 1, target));
    }, 30);

    return () => clearInterval(interval);
  }, [step, locationState.status]);

  // Debug logging
  useEffect(() => {
    console.log('LoadingBar state update:', {
      step,
      locationStatus: locationState.status,
      verificationStatus: locationState.verificationStatus,
      triggerReason: locationState.triggerReason,
      error: locationState.error,
      shouldShowError,
      shouldShowAdminAssistance,
      hasErrorHandler: Boolean(onLocationRetry),
      hasAdminHandler: Boolean(onRequestAdminAssistance),
    });
  }, [
    step,
    locationState,
    shouldShowError,
    shouldShowAdminAssistance,
    onLocationRetry,
    onRequestAdminAssistance,
  ]);

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

  // Progress bar logic
  useEffect(() => {
    const target = { auth: 25, user: 50, location: 75, ready: 100 }[step];
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 1, target));
    }, 30);
    return () => clearInterval(interval);
  }, [step]);

  // Render error UI if shouldShowError is true
  const renderLocationStatus = () => {
    console.log('Rendering status:', {
      shouldShowError,
      shouldShowAdminAssistance,
      error: locationState.error,
      verificationStatus: locationState.verificationStatus,
    });

    if (!shouldShowError) return null;

    return (
      <div className="mt-6 space-y-4">
        {locationState.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{locationState.error}</AlertDescription>
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

  // Steps configuration
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
      message: 'ตรวจสอบตำแหน่ง',
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

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white">
      <div className="w-full max-w-xs text-center px-6">
        <div
          className={`text-6xl mb-8 ${step === 'location' && locationState.status === 'loading' ? 'animate-bounce' : ''}`}
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
