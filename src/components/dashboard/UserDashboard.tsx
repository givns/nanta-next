// components/dashboard/UserDashboard.tsx
import { useState, useEffect, useCallback } from 'react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Calendar, Clock, Briefcase } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { UserData } from '@/types/user';
import {
  AttendanceStatusInfo,
  ProcessedAttendance,
  ShiftData,
  TimeEntry,
} from '@/types/attendance';
import AttendanceTable from '../AttendanceTable';
import UserShiftInfo from '../UserShiftInfo';
import { PayrollContainer } from '../payroll/PayrollContainer';
import { PayrollPeriodDisplay } from '@/types/payroll';
import { DashboardData } from '@/types/dashboard';

interface UserDashboardProps {
  initialData: DashboardData;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  initialData,
}) => {
  const [data, setData] = useState<DashboardData>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [activeTab, setActiveTab] = useState('attendance');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [dashboardResponse, timeEntriesResponse] = await Promise.all([
        fetch(`/api/dashboard?lineUserId=${initialData.user.lineUserId}`),
        fetch(
          `/api/time-entries?employeeId=${initialData.user.employeeId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
        ),
      ]);

      if (!dashboardResponse.ok || !timeEntriesResponse.ok) {
        throw new Error('Failed to refresh data');
      }

      const newDashboardData = await dashboardResponse.json();
      const newTimeEntries = await timeEntriesResponse.json();

      setData(newDashboardData);
      setTimeEntries(
        newTimeEntries.map((entry: any) => ({
          ...entry,
          status: entry.status === 'in_progress' ? 'in_progress' : 'completed',
          date: new Date(entry.date),
          startTime: new Date(entry.startTime),
          endTime: entry.endTime ? new Date(entry.endTime) : null,
        })),
      );
      setError(null);
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [
    initialData.user.lineUserId,
    initialData.user.employeeId,
    startDate,
    endDate,
  ]);

  // Fetch time entries when date range changes
  useEffect(() => {
    const fetchTimeEntries = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/time-entries?employeeId=${data.user.employeeId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
        );

        if (!response.ok) {
          throw new Error('Failed to fetch time entries');
        }

        const entriesData = await response.json();
        setTimeEntries(
          entriesData.map((entry: any) => ({
            ...entry,
            status:
              entry.status === 'in_progress' ? 'in_progress' : 'completed',
            date: new Date(entry.date),
            startTime: new Date(entry.startTime),
            endTime: entry.endTime ? new Date(entry.endTime) : null,
          })),
        );
      } catch (error) {
        console.error('Error fetching time entries:', error);
        setError('Failed to load time entries');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTimeEntries();
  }, [data.user.employeeId, startDate, endDate]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
        <Button
          onClick={refreshData}
          variant="outline"
          size="sm"
          className="ml-4"
        >
          Retry
        </Button>
      </Alert>
    );
  }

  const { user } = data;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-8">
      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button
          onClick={refreshData}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* User Profile Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col items-center space-y-4">
          <Avatar className="h-24 w-24">
            <AvatarImage
              src={user.profilePictureUrl || '/placeholder-user.jpg'}
              alt={user.name}
            />
            <AvatarFallback>
              {user.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="text-gray-600">{user.departmentName}</p>
            <p className="text-sm text-gray-500">
              รหัสพนักงาน: {user.employeeId}
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 w-full mt-4">
            <QuickStat
              icon={<Calendar className="h-5 w-5" />}
              label="วันทำงาน"
              value={data.totalPresent.toString()}
              total={data.totalWorkingDays}
            />
            <QuickStat
              icon={<Clock className="h-5 w-5" />}
              label="ชั่วโมง OT"
              value={data.overtimeHours.toFixed(1)}
              suffix="ชม."
            />
            <QuickStat
              icon={<Briefcase className="h-5 w-5" />}
              label="วันลาคงเหลือ"
              value={data.balanceLeave.toString()}
              suffix="วัน"
            />
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="attendance">การลงเวลา</TabsTrigger>
          <TabsTrigger value="payroll">เงินเดือน</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-6">
          <UserShiftInfo
            userData={user}
            attendanceStatus={data.attendanceStatus}
            effectiveShift={user.assignedShift}
          />
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              การลงเวลาประจำเดือน{' '}
              {format(startDate, 'MMMM yyyy', { locale: th })}
            </h3>
            <AttendanceTable
              timeEntries={timeEntries}
              shift={user.assignedShift}
              startDate={startDate}
              endDate={endDate}
              isLoading={isLoading}
            />
          </div>
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollContainer
            employeeId={user.employeeId}
            initialPeriod={{
              startDate: new Date(data.payrollPeriod.startDate),
              endDate: new Date(data.payrollPeriod.endDate),
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Quick Stat Component
interface QuickStatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  total?: number;
  suffix?: string;
}

const QuickStat: React.FC<QuickStatProps> = ({
  icon,
  label,
  value,
  total,
  suffix,
}) => (
  <Card>
    <CardContent className="flex flex-col items-center justify-center p-4">
      <div className="text-blue-500 mb-2">{icon}</div>
      <div className="text-2xl font-bold">
        {value}
        {total ? `/${total}` : ''}
        {suffix ? ` ${suffix}` : ''}
      </div>
      <div className="text-sm text-gray-500">{label}</div>
    </CardContent>
  </Card>
);
