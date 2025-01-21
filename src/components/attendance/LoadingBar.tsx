import React, { useState, useEffect } from 'react';
import '@flaticon/flaticon-uicons/css/all/all.css';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LocationVerificationModal from './LocationVerificationModal';

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
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRequestingHelp, setIsRequestingHelp] = useState(false);

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

  useEffect(() => {
    // Show location modal automatically if there's a location error
    if (step === 'location' && locationState?.error) {
      setShowLocationModal(true);
    }
  }, [step, locationState?.error]);

  const handleLocationRetry = async () => {
    if (!onLocationRetry) return;

    try {
      setIsRetrying(true);
      await onLocationRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRequestAssistance = async () => {
    if (!onRequestAdminAssistance) return;

    try {
      setIsRequestingHelp(true);
      await onRequestAdminAssistance();
    } finally {
      setIsRequestingHelp(false);
    }
  };

  const renderLocationStatus = () => {
    if (step !== 'location' || !locationState) return null;

    return (
      <div className="mt-4 text-sm max-w-md">
        {locationState.status === 'loading' ? (
          <div className="text-gray-600 animate-pulse">
            กำลังค้นหาตำแหน่งของคุณ...
          </div>
        ) : (
          <>
            {locationState.address && (
              <div className="text-gray-600 mb-2">
                <div className="font-medium mb-1">ที่อยู่ที่ตรวจพบ:</div>
                <div>{locationState.address}</div>
                {locationState.coordinates && (
                  <div className="text-xs mt-1">
                    ความแม่นยำ: ±{Math.round(locationState.accuracy)} เมตร
                  </div>
                )}
              </div>
            )}

            {locationState.error && (
              <>
                <Alert variant="destructive" className="mt-2 mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{locationState.error}</AlertDescription>
                </Alert>

                <div className="flex flex-col gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleLocationRetry}
                    disabled={isRetrying}
                  >
                    {isRetrying ? 'กำลังค้นหา...' : 'ค้นหาตำแหน่งอีกครั้ง'}
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleRequestAssistance}
                    disabled={isRequestingHelp}
                  >
                    {isRequestingHelp
                      ? 'กำลังส่งคำขอ...'
                      : 'ขอความช่วยเหลือจากเจ้าหน้าที่'}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
      <div className="text-center px-4">
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

        <div className="text-gray-700 font-medium">{currentStep.message}</div>

        {renderLocationStatus()}

        <LocationVerificationModal
          isOpen={showLocationModal}
          onClose={() => setShowLocationModal(false)}
          locationState={
            locationState || {
              status: 'error',
              error: null,
              address: '',
              accuracy: 0,
            }
          }
          onRequestAdminAssistance={handleRequestAssistance}
          onRetryLocation={handleLocationRetry}
        />
      </div>
    </div>
  );
};

export default LoadingBar;
