// components/LoadingBar.tsx
import React, { useState, useEffect } from 'react';
import '@flaticon/flaticon-uicons/css/all/all.css';
import { MapPin, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LoadingBarProps {
  step: 'auth' | 'user' | 'location' | 'ready';
  locationState?: {
    status: string;
    error: string | null;
    address: string;
    accuracy: number;
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
      icon: <MapPin className="w-6 h-6" />,
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
    if (step !== 'location' || !locationState) return null;

    switch (locationState.status) {
      case 'loading':
        return (
          <div className="animate-pulse text-gray-600">
            กำลังค้นหาตำแหน่งของคุณ...
          </div>
        );

      case 'ready':
        return (
          <div className="space-y-2">
            <div className="text-sm text-gray-700">
              <div className="font-medium">ตำแหน่งที่พบ:</div>
              <div>{locationState.address || 'ไม่พบที่อยู่'}</div>
              {locationState.accuracy && (
                <div className="text-xs mt-1">
                  ความแม่นยำ: ±{Math.round(locationState.accuracy)} เมตร
                </div>
              )}
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{locationState.error}</AlertDescription>
            </Alert>
            <div className="flex flex-col gap-2">
              <button
                onClick={onLocationRetry}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                ค้นหาตำแหน่งอีกครั้ง
              </button>
              <button
                onClick={onRequestAdminAssistance}
                className="px-4 py-2 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md transition-colors"
              >
                ขอความช่วยเหลือจากเจ้าหน้าที่
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
      <div className="text-center max-w-sm px-4">
        <div
          className={`text-6xl mb-6 text-center ${step === 'location' && locationState?.status === 'loading' ? 'animate-bounce' : ''}`}
        >
          {currentStep.icon}
        </div>

        <div className="mb-4 text-xl font-semibold text-gray-700">
          {progress}%
        </div>

        <div className="w-64 bg-gray-200 rounded-full h-2 overflow-hidden mb-4">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${currentStep.color}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="text-gray-700 font-medium mb-4">
          {currentStep.message}
        </div>

        {/* Location Status */}
        <div className="mt-4 transition-all duration-300 ease-in-out">
          {renderLocationStatus()}
        </div>
      </div>
    </div>
  );
};

export default LoadingBar;
