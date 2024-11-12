// components/admin/attendance/AttendanceTime.tsx
import React from 'react';
import { AlertCircle } from 'lucide-react';

interface AttendanceTimeProps {
  time: string | null | undefined;
  isLate?: boolean;
}

export function AttendanceTime({ time, isLate }: AttendanceTimeProps) {
  // Early return for null/undefined/empty time
  if (!time) {
    return <span className="text-gray-400">--:--</span>;
  }

  try {
    // Strict time format validation (HH:mm)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(time)) {
      console.warn('Invalid time format:', time);
      return <span className="text-gray-400">--:--</span>;
    }

    // Split hours and minutes for additional validation
    const [hours, minutes] = time.split(':').map(Number);
    if (
      isNaN(hours) ||
      isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      console.warn('Invalid time values:', { hours, minutes });
      return <span className="text-gray-400">--:--</span>;
    }

    // Format time with leading zeros
    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return (
      <div className="flex items-center gap-1">
        <span className={isLate ? 'text-red-500 font-medium' : ''}>
          {formattedTime}
        </span>
        {isLate && <AlertCircle className="h-4 w-4 text-red-500" />}
      </div>
    );
  } catch (error) {
    console.error('Error rendering time:', error);
    return <span className="text-gray-400">--:--</span>;
  }
}
