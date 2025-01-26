import React, { useState, useEffect } from 'react';
import { LocationVerificationState } from '@/types/attendance';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    console.log('LoadingBar props update:', {
      step,
      locationState,
      hasRetry: !!onLocationRetry,
      hasAssist: !!onRequestAdminAssistance,
    });
  }, [step, locationState, onLocationRetry, onRequestAdminAssistance]);

  // Progress bar logic...
  useEffect(() => {
    const target = { auth: 25, user: 50, location: 75, ready: 100 }[step];
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= target ? target : prev + 1));
    }, 30);
    return () => clearInterval(interval);
  }, [step]);

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

  const renderError = () => {
    if (!locationState.error) return null;

    return (
      <div className="mt-6 space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{locationState.error}</AlertDescription>
        </Alert>
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
          {onRequestAdminAssistance && (
            <button
              type="button"
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
  };

  const renderLocationStatus = () => {
    // Only show location status in location step
    if (step !== 'location') return null;

    // Show error if exists
    if (
      locationState.error ||
      locationState.verificationStatus === 'needs_verification'
    ) {
      return renderError();
    }

    // Show success state
    if (locationState.address) {
      return (
        <div className="mt-6 text-sm">
          <div className="text-green-600 font-medium mb-2">
            ระบุตำแหน่งสำเร็จ
          </div>
          <div className="text-gray-700 mb-1">{locationState.address}</div>
          {locationState.accuracy && (
            <div className="text-gray-500 text-xs">
              ความแม่นยำ: ±{Math.round(locationState.accuracy)} เมตร
            </div>
          )}
        </div>
      );
    }

    return null;
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
