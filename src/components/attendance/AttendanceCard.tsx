import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PeriodType } from '@prisma/client';
import { SerializedAttendanceRecord } from '@/types/attendance';
import { parseISO, differenceInMinutes } from 'date-fns';

const OT_CONSTANTS = {
  INCREMENT_MINUTES: 30,
  EARLY_CHECKOUT_ALLOWANCE: 5,
  LATE_START_ALLOWANCE: 15,
};

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

  const overtimeHours = useMemo(() => {
    if (
      periodType !== PeriodType.OVERTIME ||
      !record.CheckInTime ||
      !record.CheckOutTime ||
      !record.shiftStartTime ||
      !record.shiftEndTime
    ) {
      return null;
    }

    try {
      // Parse all times
      const checkIn = parseISO(record.CheckInTime);
      const checkOut = parseISO(record.CheckOutTime);
      const shiftStart = parseISO(record.shiftStartTime);
      const shiftEnd = parseISO(record.shiftEndTime);

      // Calculate effective start time (considering late start allowance)
      const effectiveStart =
        differenceInMinutes(checkIn, shiftStart) <=
        OT_CONSTANTS.LATE_START_ALLOWANCE
          ? shiftStart
          : checkIn;

      // Calculate effective end time (considering early checkout allowance)
      const minutesBeforeShiftEnd = differenceInMinutes(shiftEnd, checkOut);
      const effectiveEnd =
        minutesBeforeShiftEnd <= OT_CONSTANTS.EARLY_CHECKOUT_ALLOWANCE
          ? shiftEnd
          : checkOut;

      // Calculate total minutes
      let totalMinutes = differenceInMinutes(effectiveEnd, effectiveStart);

      // Round to nearest 30 minutes with special handling for early checkout
      let roundedMinutes;
      const remainderMinutes = totalMinutes % OT_CONSTANTS.INCREMENT_MINUTES;

      if (
        minutesBeforeShiftEnd <= OT_CONSTANTS.EARLY_CHECKOUT_ALLOWANCE &&
        remainderMinutes >=
          OT_CONSTANTS.INCREMENT_MINUTES - OT_CONSTANTS.EARLY_CHECKOUT_ALLOWANCE
      ) {
        // Round up if within early checkout allowance
        roundedMinutes =
          totalMinutes + (OT_CONSTANTS.INCREMENT_MINUTES - remainderMinutes);
      } else {
        // Normal rounding to nearest 30 minutes
        roundedMinutes = totalMinutes - remainderMinutes;
        if (remainderMinutes >= OT_CONSTANTS.INCREMENT_MINUTES / 2) {
          roundedMinutes += OT_CONSTANTS.INCREMENT_MINUTES;
        }
      }

      return {
        hours: Math.floor(roundedMinutes / 60),
        minutes: roundedMinutes % 60,
        totalMinutes: roundedMinutes,
      };
    } catch (error) {
      console.error('Error calculating overtime:', error);
      return null;
    }
  }, [record, periodType]);

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
        {/* Add overtime hours display */}
        {periodType === PeriodType.OVERTIME && overtimeHours && (
          <div className="mt-3 border-t pt-2">
            <div className="text-sm font-medium text-yellow-800">
              ชั่วโมงทำงานล่วงเวลา
            </div>
            <div className="text-sm text-gray-600">
              {overtimeHours.hours > 0 && `${overtimeHours.hours} ชั่วโมง `}
              {overtimeHours.minutes > 0 && `${overtimeHours.minutes} นาที`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AttendanceCard;
