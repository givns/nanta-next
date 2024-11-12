// components/admin/attendance/AttendanceTime.tsx
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { formatTimeString } from '@/utils/timeUtils';

interface AttendanceTimeProps {
  time: string | null | undefined;
  isLate?: boolean;
}

export function AttendanceTime({ time, isLate }: AttendanceTimeProps) {
  const formattedTime = formatTimeString(time);

  if (!formattedTime) {
    return <span className="text-gray-400">--:--</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <span className={isLate ? 'text-red-500 font-medium' : ''}>
        {formattedTime}
      </span>
      {isLate && <AlertCircle className="h-4 w-4 text-red-500" />}
    </div>
  );
}
