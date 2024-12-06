import React from 'react';
import { format } from 'date-fns';
import { AlertCircle, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  ApprovedOvertimeInfo,
  CurrentPeriodInfo,
  LatestAttendance,
  OvertimeState,
} from '@/types/attendance';

interface OvertimeCardProps {
  approvedOvertime: ApprovedOvertimeInfo;
  currentPeriod: CurrentPeriodInfo | null;
  latestAttendance: LatestAttendance | null;
}

const OvertimeCard: React.FC<OvertimeCardProps> = ({
  approvedOvertime,
  currentPeriod,
  latestAttendance,
}) => {
  const now = new Date();
  const overtimeStart = new Date(
    `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
  );
  const overtimeEnd = new Date(
    `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
  );

  const isPeriodPassed = now > overtimeEnd;
  const isCurrentlyInOvertime =
    currentPeriod?.type === 'overtime' &&
    latestAttendance?.overtimeState === OvertimeState.IN_PROGRESS;
  const hasCompletedOvertime =
    latestAttendance?.overtimeState === OvertimeState.COMPLETED;

  const getStatusDisplay = () => {
    if (hasCompletedOvertime) {
      return {
        text: 'เสร็จสิ้น',
        className: 'bg-green-100 text-green-800',
      };
    }
    if (isPeriodPassed) {
      return {
        text: 'หมดเวลา',
        className: 'bg-gray-100 text-gray-800',
      };
    }
    if (isCurrentlyInOvertime) {
      return {
        text: 'กำลังทำงาน',
        className: 'bg-yellow-100 text-yellow-800',
      };
    }
    return {
      text: 'รอดำเนินการ',
      className: 'bg-blue-100 text-blue-800',
    };
  };

  const statusDisplay = getStatusDisplay();

  return (
    <Card
      className={`${isPeriodPassed && !hasCompletedOvertime ? 'opacity-50' : ''}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-lg">
            <AlertCircle className="mr-2 text-yellow-500" size={20} />
            การทำงานล่วงเวลา
          </CardTitle>
          <span
            className={`px-2 py-1 rounded-full text-xs ${statusDisplay.className}`}
          >
            {statusDisplay.text}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Schedule */}
          <div className="flex items-center text-gray-600">
            <Clock className="mr-2" size={16} />
            <span>
              {format(overtimeStart, 'HH:mm')} - {format(overtimeEnd, 'HH:mm')}{' '}
              ({approvedOvertime.durationMinutes} นาที)
            </span>
          </div>

          {/* Reason if exists */}
          {approvedOvertime.reason && (
            <div className="text-sm text-gray-600">
              เหตุผล: {approvedOvertime.reason}
            </div>
          )}

          {/* Status details */}
          {latestAttendance?.regularCheckInTime && (
            <div className="grid grid-cols-2 gap-4 mt-2 p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs text-gray-500">เวลาเข้างาน</p>
                <p className="font-medium">
                  {format(
                    new Date(latestAttendance.regularCheckInTime),
                    'HH:mm',
                  )}
                </p>
              </div>
              {latestAttendance.regularCheckOutTime && (
                <div>
                  <p className="text-xs text-gray-500">เวลาออกงาน</p>
                  <p className="font-medium">
                    {format(
                      new Date(latestAttendance.regularCheckOutTime),
                      'HH:mm',
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Inside/Outside shift info */}
          <div
            className={`text-xs ${approvedOvertime.isInsideShiftHours ? 'text-blue-600' : 'text-yellow-600'}`}
          >
            {approvedOvertime.isInsideShiftHours
              ? '* OT ในเวลางาน'
              : approvedOvertime.isDayOffOvertime
                ? '* OT วันหยุด'
                : '* OT นอกเวลางาน'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default React.memo(OvertimeCard);
