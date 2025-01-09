import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { User, Building2, Clock, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatSafeTime } from '@/shared/timeUtils';
import { UserData } from '@/types/user';
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';

interface DailyAttendanceSummaryProps {
  userData: UserData;
  records: {
    type: PeriodType;
    isOvertime: boolean;
    checkIn: string;
    checkOut: string | null;
    state: AttendanceState;
    checkStatus: CheckStatus;
  }[];
  onClose?: () => void;
}

const DailyAttendanceSummary: React.FC<DailyAttendanceSummaryProps> = ({
  userData,
  records,
  onClose,
}) => {
  const currentDate = new Date();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100">
        <div className="px-4 py-3">
          <div className="text-center text-4xl font-bold mb-1">
            {format(currentDate, 'HH:mm')}
          </div>
          <div className="text-center text-sm text-gray-500">
            {format(currentDate, 'EEEE d MMMM yyyy', { locale: th })}
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
          {records.map((record, index) => (
            <Card key={index} className="bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={20} className="text-primary" />
                    <span>
                      {record.type === PeriodType.REGULAR
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
                    <div className="font-medium">
                      {formatSafeTime(record.checkIn)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">ออกงาน</div>
                    <div className="font-medium">
                      {formatSafeTime(record.checkOut)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
