import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface OvertimeCheckoutHandlerProps {
  periodWindow: {
    start: string;
    end: string;
  };
  onAutoComplete: () => Promise<void>;
  isProcessing: boolean;
}

const OvertimeCheckoutHandler: React.FC<OvertimeCheckoutHandlerProps> = ({
  periodWindow,
  onAutoComplete,
  isProcessing,
}) => {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else {
      onAutoComplete();
    }
  }, [countdown, onAutoComplete]);

  if (isProcessing) {
    return (
      <div className="p-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>กำลังดำเนินการลงเวลาออก OT...</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          เลยเวลาลงเวลาออก OT แล้ว ระบบจะทำการลงเวลาให้โดยอัตโนมัติใน{' '}
          {countdown} วินาที
          <br />
          เวลา OT: {format(
            new Date(periodWindow.start),
            'HH:mm',
          )} - {format(new Date(periodWindow.end), 'HH:mm')} น.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default OvertimeCheckoutHandler;
