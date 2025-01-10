import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Calendar, Clock, AlertCircle } from 'lucide-react';
import { formatSafeTime } from '@/shared/timeUtils';
import { NextDayInfoProps } from '@/types/attendance';

const NextDayInfo: React.FC<NextDayInfoProps> = ({ nextDayInfo }) => {
  console.log('Debug NextDayInfo:', {
    hasOvertime: Boolean(nextDayInfo.overtime),
    overtime: nextDayInfo.overtime,
  });

  return (
    <Card className="bg-slate-400-100 mb-4">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar size={20} className="text-primary" />
          <span>ตารางงานวันพรุ่งนี้</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Holiday */}
        {nextDayInfo.isHoliday && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle size={16} />
            <span>
              วันหยุดนักขัตฤกษ์
              {nextDayInfo.holidayInfo?.name
                ? `: ${nextDayInfo.holidayInfo.name}`
                : ''}
            </span>
          </div>
        )}

        {/* Day Off */}
        {nextDayInfo.isDayOff && (
          <div className="flex items-center gap-2 text-orange-600">
            <AlertCircle size={16} />
            <span>วันหยุดประจำสัปดาห์</span>
          </div>
        )}

        {/* Leave */}
        {nextDayInfo.leaveInfo && (
          <div className="flex items-center gap-2 text-blue-600">
            <AlertCircle size={16} />
            <div>
              <span>{nextDayInfo.leaveInfo.type}</span>
              <span className="text-sm text-gray-500 ml-2">
                {nextDayInfo.leaveInfo.duration}
              </span>
            </div>
          </div>
        )}

        {/* Regular Shift */}
        {!nextDayInfo.isHoliday &&
          !nextDayInfo.isDayOff &&
          !nextDayInfo.leaveInfo && (
            <div>
              {/* Shift Info */}
              <div className="flex items-start gap-2 mb-2">
                <Clock size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  <div className="font-medium">
                    {nextDayInfo.shift.name}
                    {nextDayInfo.shift.isAdjusted && (
                      <span className="ml-2 text-sm text-amber-600">
                        (ปรับเปลี่ยนเวลา)
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatSafeTime(nextDayInfo.shift.startTime)} -{' '}
                    {formatSafeTime(nextDayInfo.shift.endTime)} น.
                  </div>
                  {nextDayInfo.shift.isAdjusted &&
                    nextDayInfo.shift.adjustedInfo && (
                      <div className="text-xs text-gray-400 mt-1">
                        <div>
                          เวลาเดิม:{' '}
                          {formatSafeTime(
                            nextDayInfo.shift.adjustedInfo.originalStart,
                          )}{' '}
                          -{' '}
                          {formatSafeTime(
                            nextDayInfo.shift.adjustedInfo.originalEnd,
                          )}{' '}
                          น.
                        </div>
                        <div>
                          เหตุผล: {nextDayInfo.shift.adjustedInfo.reason}
                        </div>
                      </div>
                    )}
                </div>
              </div>
              {/* Overtime Info */}
              {nextDayInfo.overtime && (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium text-yellow-600">
                    งานล่วงเวลา
                  </div>
                  <div className="ml-6 text-sm">
                    <div className="text-gray-600">
                      {formatSafeTime(nextDayInfo.overtime.startTime)} -{' '}
                      {formatSafeTime(nextDayInfo.overtime.endTime)} น.
                      <span className="text-gray-400 ml-2">
                        ({nextDayInfo.overtime.durationMinutes} นาที)
                      </span>
                    </div>
                    {nextDayInfo.overtime.reason && (
                      <div className="text-xs text-gray-500">
                        เหตุผล: {nextDayInfo.overtime.reason}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
      </CardContent>
    </Card>
  );
};

export default NextDayInfo;
