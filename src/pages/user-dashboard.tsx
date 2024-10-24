import { useState, useEffect } from 'react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Calendar, Clock, Briefcase } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import liff from '@line/liff';
import { UserData } from '@/types/user';
import {
  ProcessedAttendance,
  ShiftData,
  AttendanceStatusInfo,
} from '@/types/attendance';
import { PayrollSummaryResponse } from '@/types/api';
import AttendanceTable from '../components/AttendanceTable';
import UserShiftInfo from '../components/UserShiftInfo';
import { PayrollContainer } from '../components/payroll/PayrollContainer';
import { TimeEntry } from '@/types/attendance';

interface UserDashboardProps {
  lineUserId: string | null;
}

interface DashboardData {
  user: UserData & { assignedShift: ShiftData };
  attendanceStatus: AttendanceStatusInfo | null;
  payrollAttendance: ProcessedAttendance[];
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  overtimeHours: number;
  balanceLeave: number;
  payrollPeriod: {
    start: string;
    end: string;
  };
}

export default function UserDashboard({ lineUserId }: UserDashboardProps) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [activeTab, setActiveTab] = useState('attendance');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        if (!lineUserId) {
          throw new Error('No LINE user ID available');
        }

        const response = await fetch(`/api/users?lineUserId=${lineUserId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }

        const data: DashboardData = await response.json();
        setDashboardData(data);

        if (data.user?.employeeId) {
          const timeEntriesResponse = await fetch(
            `/api/time-entries?employeeId=${data.user.employeeId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
          );

          if (timeEntriesResponse.ok) {
            const timeEntriesData = await timeEntriesResponse.json();
            const typedEntries: TimeEntry[] = timeEntriesData.map(
              (entry: any) => ({
                ...entry,
                status:
                  entry.status === 'in_progress' ? 'in_progress' : 'completed',
                date: new Date(entry.date),
                startTime: new Date(entry.startTime),
                endTime: entry.endTime ? new Date(entry.endTime) : null,
              }),
            );
            setTimeEntries(typedEntries);
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError(
          error instanceof Error ? error.message : 'An unknown error occurred',
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (lineUserId) {
      fetchDashboardData();
    }
  }, [lineUserId, startDate, endDate]);

  useEffect(() => {
    const fetchTimeEntries = async () => {
      try {
        const response = await fetch(
          `/api/time-entries?employeeId=${dashboardData?.user.employeeId}`,
        );
        if (response.ok) {
          const data = await response.json();
          // Transform the status to match our strict type
          const typedEntries: TimeEntry[] = data.map((entry: any) => ({
            ...entry,
            status:
              entry.status === 'in_progress' ? 'in_progress' : 'completed',
            // Transform dates if needed
            date: new Date(entry.date),
            startTime: new Date(entry.startTime),
            endTime: entry.endTime ? new Date(entry.endTime) : null,
          }));
          setTimeEntries(typedEntries);
        }
      } catch (error) {
        console.error('Error fetching time entries:', error);
      }
    };

    if (dashboardData?.user.employeeId) {
      fetchTimeEntries();
    }
  }, [dashboardData?.user.employeeId]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!dashboardData) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No dashboard data available.</AlertDescription>
      </Alert>
    );
  }

  const { user } = dashboardData;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-8">
      {/* User Profile Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col items-center space-y-4">
          <Avatar className="h-24 w-24">
            <AvatarImage
              src={user.profilePictureUrl || '/placeholder-user.jpg'}
            />
            <AvatarFallback>
              {user.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="text-gray-600">{user.departmentName}</p>
            <p className="text-sm text-gray-500">
              Employee ID: {user.employeeId}
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 w-full mt-4">
            <QuickStat
              icon={<Calendar className="h-5 w-5" />}
              label="Days Present"
              value={dashboardData.totalPresent.toString()}
            />
            <QuickStat
              icon={<Clock className="h-5 w-5" />}
              label="OT Hours"
              value={dashboardData.overtimeHours.toString()}
            />
            <QuickStat
              icon={<Briefcase className="h-5 w-5" />}
              label="Leave Balance"
              value={dashboardData.balanceLeave.toString()}
            />
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-6">
          <UserShiftInfo
            userData={user}
            attendanceStatus={dashboardData.attendanceStatus}
            effectiveShift={user.assignedShift}
          />
          <AttendanceTable
            timeEntries={timeEntries}
            shift={user.assignedShift}
            startDate={startDate}
            endDate={endDate}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollContainer employeeId={user.employeeId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Quick Stat Component
interface QuickStatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const QuickStat: React.FC<QuickStatProps> = ({ icon, label, value }) => (
  <Card>
    <CardContent className="flex flex-col items-center justify-center p-4">
      <div className="text-blue-500 mb-2">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </CardContent>
  </Card>
);

// Loading Skeleton
const DashboardSkeleton = () => (
  <div className="w-full max-w-4xl mx-auto p-4 space-y-8">
    <div className="flex flex-col items-center space-y-4">
      <Skeleton className="h-24 w-24 rounded-full" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-32" />

      <div className="grid grid-cols-3 gap-4 w-full mt-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>

    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  </div>
);
