import React, { useState } from 'react';
import { AlertCircle, MapPin, PhoneCall } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LocationVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationState: {
    status: string;
    error: string | null;
    address: string;
    accuracy: number;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  onRequestAdminAssistance: () => Promise<void>;
  onRetryLocation: () => Promise<void>;
}

const LocationVerificationModal: React.FC<LocationVerificationModalProps> = ({
  isOpen,
  onClose,
  locationState,
  onRequestAdminAssistance,
  onRetryLocation,
}) => {
  const [isRequestingHelp, setIsRequestingHelp] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRequestAssistance = async () => {
    try {
      setIsRequestingHelp(true);
      await onRequestAdminAssistance();
    } finally {
      setIsRequestingHelp(false);
    }
  };

  const handleRetryLocation = async () => {
    try {
      setIsRetrying(true);
      await onRetryLocation();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            ตรวจสอบตำแหน่ง
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {locationState.error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{locationState.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-4">
            <div className="text-sm text-gray-500">
              <div className="font-medium mb-1">ที่อยู่ปัจจุบัน</div>
              <div>{locationState.address || 'ไม่พบข้อมูลที่อยู่'}</div>
            </div>

            {locationState.coordinates && (
              <div className="text-sm text-gray-500">
                <div className="font-medium mb-1">พิกัด GPS</div>
                <div>
                  {locationState.coordinates.latitude},{' '}
                  {locationState.coordinates.longitude}
                </div>
                <div className="text-xs mt-1">
                  ความแม่นยำ: ±{Math.round(locationState.accuracy)} เมตร
                </div>
              </div>
            )}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                หากไม่สามารถระบุตำแหน่งได้ กรุณาขอความช่วยเหลือจากเจ้าหน้าที่
              </AlertDescription>
            </Alert>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={handleRetryLocation}
            disabled={isRetrying}
            className="w-full sm:w-auto"
          >
            {isRetrying ? 'กำลังตรวจสอบ...' : 'ตรวจสอบอีกครั้ง'}
          </Button>
          <Button
            onClick={handleRequestAssistance}
            disabled={isRequestingHelp}
            className="w-full sm:w-auto"
          >
            <PhoneCall className="mr-2 h-4 w-4" />
            {isRequestingHelp ? 'กำลังส่งคำขอ...' : 'ขอความช่วยเหลือ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocationVerificationModal;
