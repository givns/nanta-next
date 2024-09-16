// user-dashboard.tsx
import { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Calendar } from '../components/ui/calendar';
import { Input } from '../components/ui/input';
import liff from '@line/liff';
import { UserData } from '@/types/user';
import { ProcessedAttendance, ShiftData } from '@/types/attendance';
import moment from 'moment-timezone';
import AttendanceTable from '../components/AttendanceTable';

interface DashboardData {
  user: UserData & { assignedShift: ShiftData };
  payrollAttendance: ProcessedAttendance[];
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  overtimeHours: number;
  balanceLeave: number;
  payrollPeriod: { start: string; end: string };
}

export default function UserDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        if (!liff.isLoggedIn()) {
          throw new Error('User is not logged in');
        }

        const profile = await liff.getProfile();
        const response = await fetch(`/api/users?lineUserId=${profile.userId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }

        const data: DashboardData = await response.json();
        setDashboardData(data);
      } catch (error) {
        console.error('Error fetching user data:', error);
        setError(
          error instanceof Error ? error.message : 'An unknown error occurred',
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!dashboardData) {
    return <div>No dashboard data available.</div>;
  }

  const {
    user,
    payrollAttendance,
    totalWorkingDays,
    totalPresent,
    totalAbsent,
    overtimeHours,
    balanceLeave,
    payrollPeriod,
  } = dashboardData;

  return (
    <div className="flex flex-col items-center w-full max-w-md p-4 mx-auto space-y-4 border rounded-md">
      <div className="flex flex-col items-center w-full space-y-4">
        <Avatar className="h-16 w-16 rounded-full">
          <AvatarImage
            src={user.profilePictureUrl || '/placeholder-user.jpg'}
          />
          <AvatarFallback>
            {user.name.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="grid gap-0.5 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-muted-foreground">
            {String(user.departmentName)}
          </div>
        </div>
      </div>
      <div className="w-full">
        <h2 className="text-xl font-bold mb-2">Payroll Period Attendance</h2>
        <p className="text-sm text-gray-600 mb-2">
          {moment(payrollPeriod.start).format('MMMM D, YYYY')} -{' '}
          {moment(payrollPeriod.end).format('MMMM D, YYYY')}
        </p>
        <AttendanceTable
          attendanceData={payrollAttendance}
          shift={user.assignedShift}
          startDate={moment(payrollPeriod.start)}
          endDate={moment(payrollPeriod.end)}
        />
      </div>

      <div className="flex flex-col w-full space-y-2">
        <div className="flex justify-between">
          <span>Total Working Days</span>
          <Input
            value={totalWorkingDays.toString()}
            readOnly
            className="w-16"
          />
        </div>
        <div className="flex justify-between">
          <span>Total Present</span>
          <Input value={totalPresent.toString()} readOnly className="w-16" />
        </div>
        <div className="flex justify-between">
          <span>Total Absent</span>
          <Input value={totalAbsent.toString()} readOnly className="w-16" />
        </div>
        <div className="flex justify-between">
          <span>Overtime Hours</span>
          <Input value={`${overtimeHours} Hr`} readOnly className="w-16" />
        </div>
        <div className="flex justify-between">
          <span>Leave Balance</span>
          <Input value={balanceLeave.toString()} readOnly className="w-16" />
        </div>
      </div>
    </div>
  );
}
