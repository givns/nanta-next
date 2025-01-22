// components/attendance/LoadingBar.tsx
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
    if (step !== 'location' || !locationState) return null;

    // Handle location permission denied specifically
    if (
      locationState.error?.includes('User denied Geolocation') ||
      locationState.error?.includes('Permission denied')
    ) {
      return (
        <div className="mt-6 space-y-4">
          <div className="text-red-600 text-sm">
            <div className="font-medium mb-2">
              ไม่สามารถระบุตำแหน่งได้เนื่องจากการเข้าถึงตำแหน่งถูกปิดกั้น
            </div>
            <div className="text-gray-600 text-sm space-y-2">
              <p>กรุณาทำตามขั้นตอนต่อไปนี้:</p>
              <ol className="list-decimal list-inside space-y-1 text-left">
                <li>เปิดการใช้งาน Location Services บนอุปกรณ์ของคุณ</li>
                <li>อนุญาตให้เว็บไซต์เข้าถึงตำแหน่งของคุณ</li>
                <li>กดปุ่ม ลองใหม่ เพื่อตรวจสอบตำแหน่งอีกครั้ง</li>
              </ol>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={onLocationRetry}
              className="w-full px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              ลองใหม่อีกครั้ง
            </button>
            <button
              onClick={onRequestAdminAssistance}
              className="w-full px-4 py-2 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md transition-colors"
            >
              ขอความช่วยเหลือจากเจ้าหน้าที่
            </button>
          </div>
        </div>
      );
    }

    // Rest of the location status rendering...

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
