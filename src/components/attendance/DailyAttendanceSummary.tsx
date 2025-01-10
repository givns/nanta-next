import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { User, Building2, Clock, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PeriodType } from '@prisma/client';
import { getCurrentTime } from '@/utils/dateUtils';
import { formatSafeTime } from '@/shared/timeUtils';
import {
  UserData,
  AttendanceRecord,
  SerializedAttendanceRecord,
} from '@/types/attendance';

interface TimeDisplay {
  checkIn: string | null;
  checkOut: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
}

const AttendanceCard: React.FC<{
  record: SerializedAttendanceRecord;
  periodType: PeriodType;
}> = ({ record, periodType }) => {
  const times: TimeDisplay = {
    checkIn: record.CheckInTime,
    checkOut: record.CheckOutTime,
    shiftStart: record.shiftStartTime,
    shiftEnd: record.shiftEndTime,
  };

  console.log('Rendering card with times:', {
    type: periodType,
    raw: times,
    formatted: {
      checkIn: times.checkIn,
      checkOut: times.checkOut,
      shiftStart: times.shiftStart,
      shiftEnd: times.shiftEnd,
    },
  });

  return (
    <Card className="bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-primary" />
            <span>
              {periodType === PeriodType.REGULAR
                ? 'กะปกติ'
                : 'ช่วงทำงานล่วงเวลา'}
            </span>
          </div>
          {record.isOvertime && (
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
            <div className="font-medium">{formatSafeTime(times.checkIn)}</div>
            {times.shiftStart && (
              <div className="text-xs text-gray-400">
                ช่วงเวลา {formatSafeTime(times.shiftStart)}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">ออกงาน</div>
            <div className="font-medium">{formatSafeTime(times.checkOut)}</div>
            {times.shiftEnd && (
              <div className="text-xs text-gray-400">
                ถึง {formatSafeTime(times.shiftEnd)}
              </div>
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

interface DailyAttendanceSummaryProps {
  userData: UserData;
  records: Array<{
    record: SerializedAttendanceRecord;
    periodSequence: number;
  }>;
  onClose?: () => void;
}

const DailyAttendanceSummary: React.FC<DailyAttendanceSummaryProps> = ({
  userData,
  records,
  onClose,
}) => {
  const currentTime = getCurrentTime();

  const sortedRecords = React.useMemo(() => {
    const recordsByType: Record<
      PeriodType,
      Array<{
        record: SerializedAttendanceRecord;
        periodSequence: number;
      }>
    > = {
      [PeriodType.REGULAR]: [],
      [PeriodType.OVERTIME]: [],
    };

    records.forEach((item) => {
      recordsByType[item.record.type].push(item);
    });

    // Sort each type's records by sequence
    Object.values(recordsByType).forEach((typeRecords) => {
      typeRecords.sort((a, b) => a.periodSequence - b.periodSequence);
    });

    return recordsByType;
  }, [records]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100">
        <div className="px-4 py-3">
          <div className="text-center text-4xl font-bold mb-1">
            {format(currentTime, 'HH:mm')}
          </div>
          <div className="text-center text-sm text-gray-500">
            {format(currentTime, 'EEEE d MMMM yyyy', { locale: th })}
          </div>
        </div>
      </header>

      <main className="flex-1 mt-20 mb-24 overflow-y-auto">
        {/* User Information */}
        <div className="bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <User size={20} className="text-gray-400" />
            <div>
              <div className="font-medium text-2xl">{userData.name}</div>
              <div className="text-sm text-gray-500">
                รหัส: {userData.employeeId}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Building2 size={20} className="text-gray-400" />
            <div className="text-sm text-gray-500">
              {userData.departmentName}
            </div>
          </div>
        </div>

        {/* Day Complete Status */}
        <div className="m-4 bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="text-green-500" size={24} />
          <div>
            <div className="font-medium text-green-700">
              บันทึกเวลาวันนี้เสร็จสมบูรณ์
            </div>
            <div className="text-sm text-green-600">ลงเวลาครบทุกช่วงแล้ว</div>
          </div>
        </div>

        {/* Attendance Records */}
        <div className="px-4 space-y-4">
          {sortedRecords[PeriodType.REGULAR].map(({ record }) => (
            <AttendanceCard
              key={`regular-${record.id}`}
              record={record}
              periodType={PeriodType.REGULAR}
            />
          ))}

          {sortedRecords[PeriodType.OVERTIME].map(({ record }) => (
            <AttendanceCard
              key={`overtime-${record.id}`}
              record={record}
              periodType={PeriodType.OVERTIME}
            />
          ))}
        </div>

        {/* Close Button */}
        <div className="flex justify-center mt-6">
          <button
            onClick={onClose}
            className="bg-gray-100 text-gray-600 px-6 py-2 rounded-full hover:bg-gray-200"
          >
            ปิด
          </button>
        </div>
      </main>
    </div>
  );
};

export default DailyAttendanceSummary;
