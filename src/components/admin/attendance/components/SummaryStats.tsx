// components/admin/attendance/components/SummaryStats.tsx
import {
  CalendarDays,
  UserCheck,
  UserX,
  Users,
  ChevronDown,
} from 'lucide-react';
import { StatCard } from '@/components/admin/attendance/StatCard';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

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
  // Mobile summary card
  const MobileSummary = () => (
    <Sheet>
      <SheetTrigger asChild>
        <div className="bg-white rounded-lg p-4 flex justify-between items-center cursor-pointer">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-gray-500" />
            <div>
              <div className="text-sm font-medium text-gray-500">Total</div>
              <div className="text-2xl font-bold">{summary.total}</div>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 text-gray-400" />
        </div>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Attendance Summary</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <StatCard
            title="Total Employees"
            value={summary.total}
            icon={Users}
          />
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
      </SheetContent>
    </Sheet>
  );

  // Desktop grid layout
  const DesktopSummary = () => (
    <div className="grid grid-cols-5 gap-4">
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

  return (
    <>
      <div className="md:hidden">
        <MobileSummary />
      </div>
      <div className="hidden md:block">
        <DesktopSummary />
      </div>
    </>
  );
}
