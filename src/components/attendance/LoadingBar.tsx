// components/attendance/LoadingBar.tsx
import React, { useState, useEffect } from 'react';
import '@flaticon/flaticon-uicons/css/all/all.css';

interface LoadingBarProps {
  step: 'auth' | 'user' | 'location' | 'ready';
  locationState?: {
    status:
      | 'initializing'
      | 'loading'
      | 'ready'
      | 'error'
      | 'pending_admin'
      | 'waiting_admin';
    error: string | null;
    address: string;
    accuracy: number;
    verificationStatus?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
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

  const renderLocationStatus = () => {
    console.log('renderLocationStatus state:', { locationState, step });

    // Always show error/verification UI regardless of step
    if (
      locationState?.status === 'error' ||
      locationState?.verificationStatus === 'needs_verification'
    ) {
      return (
        <div className="mt-6 space-y-4">
          <div className="text-red-600 text-sm">{locationState.error}</div>
          <div className="space-y-2">
            <button
              onClick={onLocationRetry}
              className="w-full px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              ลองใหม่อีกครั้ง
            </button>
            <button
              onClick={onRequestAdminAssistance}
              className="w-full px-4 py-2 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md"
            >
              ขอความช่วยเหลือจากเจ้าหน้าที่
            </button>
          </div>
        </div>
      );
    }

    // Only show location status for location step
    if (step !== 'location') return null;

    return (
      <div className="mt-6 text-sm">
        {locationState?.address ?? (
          <div className="text-gray-600 animate-pulse">กำลังระบุที่อยู่...</div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white">
      <div className="w-full max-w-xs text-center px-6">
        <div
          className={`text-6xl mb-8 ${step === 'location' && locationState?.status === 'loading' ? 'animate-bounce' : ''}`}
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
