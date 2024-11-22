// components/admin/attendance/components/MobileView.tsx

import { DailyAttendanceRecord } from '@/types/attendance';
import { EmptyState } from './EmptyState';
import { AttendanceCard } from '../AttendanceCard';

interface MobileViewProps {
  records: DailyAttendanceRecord[];
  onRecordSelect: (record: DailyAttendanceRecord) => void;
}

export function MobileView({ records, onRecordSelect }: MobileViewProps) {
  return (
    <div className="md:hidden space-y-4">
      {records.map((record) => (
        <AttendanceCard
          key={record.employeeId}
          record={record}
          onView={() => onRecordSelect(record)}
        />
      ))}
      {records.length === 0 && <EmptyState />}
    </div>
  );
}
