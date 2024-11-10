import React from 'react';
import { AlertCircle } from 'lucide-react';

interface AttendanceTimeProps {
  time: string | null;
  isLate?: boolean;
}

// components/admin/attendance/AttendanceTime.tsx
export function AttendanceTime({ time, isLate }: AttendanceTimeProps) {
  if (!time || time === 'Invalid Date') {
    return <span className="text-gray-400">--:--</span>;
  }

  // Ensure time is in HH:mm format
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
}
