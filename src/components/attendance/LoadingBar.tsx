// components/attendance/LoadingBar.tsx
import React, { useState, useEffect } from 'react';
import '@flaticon/flaticon-uicons/css/all/all.css';
import { LocationVerificationState } from '@/types/attendance';

interface LoadingBarProps {
  step: 'auth' | 'user' | 'location' | 'ready';
  locationState: LocationVerificationState;
  onLocationRetry?: () => Promise<void>;
  onRequestAdminAssistance?: () => Promise<void>;
}

interface LoadingBarProps {
  step: 'auth' | 'user' | 'location' | 'ready';
  locationState: LocationVerificationState;
  onLocationRetry?: () => Promise<void>;
  onRequestAdminAssistance?: () => Promise<void>;
}

const LoadingBar: React.FC<LoadingBarProps> = ({
  step,
  locationState,
  onLocationRetry,
  onRequestAdminAssistance,
}) => {
  console.log('LoadingBar rendered:', {
    step,
    locationState,
    hasRetryHandler: !!onLocationRetry,
    hasAssistHandler: !!onRequestAdminAssistance,
  });

  const [progress, setProgress] = useState(0);

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

  useEffect(() => {
    const target = { auth: 25, user: 50, location: 75, ready: 100 }[step];
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= target ? target : prev + 1));
    }, 30);
    return () => clearInterval(interval);
  }, [step]);

  const currentStep = steps[step];

  useEffect(() => {
    console.log('LoadingBar state update:', {
      status: locationState?.status,
      error: locationState?.error,
      verificationStatus: locationState?.verificationStatus,
    });
  }, [
    locationState?.status,
    locationState?.error,
    locationState?.verificationStatus,
  ]);

  const renderLocationStatus = () => {
    const hasError = Boolean(locationState?.error);
    const isErrorStatus = locationState?.status === 'error';
    const needsVerification =
      locationState?.verificationStatus === 'needs_verification';
    const shouldShowErrorUI = hasError || isErrorStatus || needsVerification;

    console.log('LoadingBar renderLocation:', {
      hasError,
      isErrorStatus,
      needsVerification,
      shouldShowErrorUI,
      currentState: locationState,
      step,
    });

    // Priority check for error UI
    if (shouldShowErrorUI && (onLocationRetry || onRequestAdminAssistance)) {
      console.log('Rendering error UI with buttons');
      return (
        <div className="mt-6 space-y-4">
          {locationState?.error && (
            <div className="text-red-600 text-sm">{locationState.error}</div>
          )}
          <div className="flex flex-col space-y-2">
            {onLocationRetry && (
              <button
                onClick={onLocationRetry}
                className="w-full px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                ลองใหม่อีกครั้ง
              </button>
            )}
            {onRequestAdminAssistance && (
              <button
                onClick={onRequestAdminAssistance}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                <i className="fi fi-br-phone-call text-sm"></i>
                ขอความช่วยเหลือจากเจ้าหน้าที่
              </button>
            )}
          </div>
        </div>
      );
    }

    // Normal location status
    if (step !== 'location') return null;

    return (
      <div className="mt-6 text-sm">
        {locationState.address ? (
          <>
            <div className="text-green-600 font-medium mb-2">
              ระบุตำแหน่งสำเร็จ
            </div>
            <div className="text-gray-700 mb-1">{locationState.address}</div>
            {locationState.accuracy && (
              <div className="text-gray-500 text-xs">
                ความแม่นยำ: ±{Math.round(locationState.accuracy)} เมตร
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-600 animate-pulse">กำลังระบุที่อยู่...</div>
        )}
      </div>
    );
  };

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
