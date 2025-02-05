// TodaySummary.tsx
import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { User, Building2, Clock, CheckCircle, Calendar } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getCurrentTime } from '@/utils/dateUtils';
import { formatSafeTime } from '@/shared/timeUtils';
import AttendanceCard from './AttendanceCard';
import { TodaySummaryProps } from '@/types/attendance';

const TodaySummary: React.FC<TodaySummaryProps> = ({
  userData,
  records,
  onViewNextDay,
  onClose,
}) => {
  const currentTime = getCurrentTime();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
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

      <main className="flex-1 mt-20 mb-24 overflow-y-auto bg-gray-50">
        {/* User Information Card */}
        <div className="bg-white px-6 py-4 shadow-sm border-b">
          <div className="max-w-3xl mx-auto">
            {/* Name and ID section */}
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <User size={24} className="text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <h1 className="font-semibold text-2xl text-gray-900">
                    {userData.name}
                  </h1>
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-full">
                    <span className="text-sm font-medium text-gray-700">
                      รหัสพนักงาน
                    </span>
                    <span className="text-sm font-mono text-primary">
                      {userData.employeeId}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Department section */}
            <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
              <div className="p-2 bg-gray-50 rounded-lg">
                <Building2 size={20} className="text-gray-500" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-500 mb-1">แผนก</div>
                <div className="font-medium text-gray-900">
                  {userData.departmentName}
                </div>
              </div>
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

        {/* Today's Records */}
        <div className="px-4 space-y-4">
          {records.map(({ record, periodSequence }) => (
            <AttendanceCard
              key={`${record.type}-${periodSequence}`}
              record={record}
              periodType={record.type}
            />
          ))}
        </div>

        {/* View Next Day Button */}
        <div className="px-4 mt-6">
          <Button
            onClick={onViewNextDay}
            className="w-full bg-primary text-black hover:bg-primary/90 flex items-center justify-center gap-2 py-6"
          >
            <Calendar size={20} />
            ดูตารางงานวันพรุ่งนี้
          </Button>
        </div>

        {/* Close Button */}
        <div className="flex justify-center mt-4 mb-4">
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

export default TodaySummary;
