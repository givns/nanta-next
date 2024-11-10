// components/admin/attendance/AttendanceTime.tsx
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { parseISO, isValid } from 'date-fns';

interface AttendanceTimeProps {
  time: string | null | undefined;
  isLate?: boolean;
}

export function AttendanceTime({ time, isLate }: AttendanceTimeProps) {
  if (!time) {
    return <span className="text-gray-400">--:--</span>;
  }

  try {
    // Validate time format (HH:mm)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      console.warn('Invalid time format:', time);
      return <span className="text-gray-400">--:--</span>;
    }

    return (
      <div className="flex items-center gap-1">
        <span className={isLate ? 'text-red-500 font-medium' : ''}>{time}</span>
        {isLate && <AlertCircle className="h-4 w-4 text-red-500" />}
      </div>
    );
  } catch (error) {
    console.error('Error rendering time:', error);
    return <span className="text-gray-400">--:--</span>;
  }
}
