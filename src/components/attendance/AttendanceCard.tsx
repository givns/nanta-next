import React from 'react';
import { Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PeriodType } from '@prisma/client';
import { SerializedAttendanceRecord } from '@/types/attendance';

const AttendanceCard: React.FC<{
  record: SerializedAttendanceRecord;
  periodType: PeriodType;
}> = ({ record, periodType }) => {
  const formatTime = (timeStr: string | null): string => {
    if (!timeStr) return '--:--';

    try {
      if (timeStr.includes('Z') || timeStr.includes('+')) {
        return timeStr.split('T')[1].slice(0, 5);
      }

      if (timeStr.includes('T')) {
        return timeStr.split('T')[1].slice(0, 5);
      }

      if (/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) {
        return timeStr.slice(0, 5);
      }

      return '--:--';
    } catch (error) {
      console.error('Time formatting error:', error);
      return '--:--';
    }
  };

  const times = {
    checkIn: record.CheckInTime ? formatTime(record.CheckInTime) : null,
    checkOut: record.CheckOutTime ? formatTime(record.CheckOutTime) : null,
    shiftStart: record.shiftStartTime
      ? formatTime(record.shiftStartTime)
      : null,
    shiftEnd: record.shiftEndTime ? formatTime(record.shiftEndTime) : null,
  };

  return (
    <Card className="bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-primary" />
            <span>
              {periodType === PeriodType.REGULAR
                ? 'เวลาทำงานปกติ'
                : 'ช่วงทำงานล่วงเวลา'}
            </span>
          </div>
          {/* Only show OT badge for overtime period type */}
          {periodType === PeriodType.OVERTIME && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
              OT
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">เข้างาน</div>
            <div className="font-medium">{times.checkIn || '--:--'}</div>
            {times.shiftStart && (
              <div className="text-xs text-gray-400">
                ช่วงเวลา {times.shiftStart}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">ออกงาน</div>
            <div className="font-medium">{times.checkOut || '--:--'}</div>
            {times.shiftEnd && (
              <div className="text-xs text-gray-400">ถึง {times.shiftEnd}</div>
            )}
          </div>
        </div>

        {record.checkTiming && (
          <div className="mt-2 text-xs text-gray-500">
            {record.checkTiming.isLateCheckIn && (
              <div>เข้างานช้า {record.checkTiming.lateCheckInMinutes} นาที</div>
            )}
            {record.checkTiming.isLateCheckOut && (
              <div>ออกงานช้า {record.checkTiming.lateCheckOutMinutes} นาที</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AttendanceCard;
