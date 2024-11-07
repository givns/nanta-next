// components/admin/attendance/components/AttendanceTime.tsx

import { Badge } from '@/components/ui/badge';

interface AttendanceTimeProps {
  time: string | null | undefined;
  isLate?: boolean;
}

// Utility Functions
const formatTime = (timeString: string | null | undefined): string => {
  if (!timeString) return '-';
  return timeString.match(/^\d{2}:\d{2}$/) ? timeString : '-';
};

export function AttendanceTime({ time, isLate }: AttendanceTimeProps) {
  return (
    <div className="flex items-center gap-2">
      {formatTime(time)}
      {isLate && (
        <Badge variant="warning" className="h-5">
          Late
        </Badge>
      )}
    </div>
  );
}
