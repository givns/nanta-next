// components/admin/attendance/components/SummaryStats.tsx

import { CalendarDays, UserCheck, UserX, Users } from 'lucide-react';
import { StatCard } from '@/components/admin/attendance/StatCard';

interface SummaryStatsProps {
  summary: {
    total: number;
    present: number;
    absent: number;
    onLeave: number;
    dayOff: number;
  };
}

export function SummaryStats({ summary }: SummaryStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <StatCard title="Total Employees" value={summary.total} icon={Users} />
      <StatCard
        title="Present"
        value={summary.present}
        icon={UserCheck}
        className="bg-green-50"
      />
      <StatCard
        title="Absent"
        value={summary.absent}
        icon={UserX}
        className="bg-red-50"
      />
      <StatCard
        title="On Leave"
        value={summary.onLeave}
        icon={CalendarDays}
        className="bg-blue-50"
      />
      <StatCard
        title="Day Off"
        value={summary.dayOff}
        icon={CalendarDays}
        className="bg-gray-50"
      />
    </div>
  );
}
