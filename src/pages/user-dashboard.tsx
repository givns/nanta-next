// pages/user-dashboard.tsx

import { useState, useEffect, useContext } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Calendar } from '../components/ui/calendar';
import { Input } from '../components/ui/input';
import { LiffContext } from './_app';
import { UserData, Attendance, ShiftData } from '@/types/user';
import { getDepartmentById } from '@/lib/shiftCache';

interface DashboardProps {
  user: UserData & { assignedShift: ShiftData };
  recentAttendance: Attendance[];
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  overtimeHours: number;
  balanceLeave: number;
}

export default function UserDashboard() {
  const [userData, setUserData] = useState<DashboardProps | null>(null);
  const liff = useContext(LiffContext);

  useEffect(() => {
    const fetchUserData = async () => {
      if (liff && liff.isLoggedIn()) {
        try {
          const profile = await liff.getProfile();
          const response = await fetch(
            `/api/users?lineUserId=${profile.userId}`,
          );
          if (!response.ok) throw new Error('Failed to fetch user data');
          const data: DashboardProps = await response.json();
          setUserData(data);
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      }
    };

    fetchUserData();
  }, [liff]);

  if (!userData) {
    return <div>Loading...</div>;
  }

  const { user, recentAttendance } = userData;
  const latestAttendance = recentAttendance[0];

  return (
    <div className="flex flex-col items-center w-full max-w-md p-4 mx-auto space-y-4 border rounded-md">
      <div className="flex flex-col items-center w-full space-y-4">
        <Avatar className="h-16 w-16 rounded-full">
          <AvatarImage
            src={
              user.profilePictureExternal ||
              user.profilePictureUrl ||
              '/placeholder-user.jpg'
            }
          />
          <AvatarFallback>
            {user.name.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="grid gap-0.5 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-muted-foreground">{user.department}</div>
        </div>
      </div>
      <div className="flex flex-col w-full space-y-2">
        <div className="flex justify-between">
          <span>รหัสพนักงาน</span>
          <span>{user.employeeId}</span>
        </div>
        <div className="flex justify-between">
          <span>เวลาเข้างาน</span>
          <span>
            {latestAttendance?.checkInTime
              ? new Date(latestAttendance.checkInTime).toLocaleTimeString()
              : 'N/A'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>เวลาออกงาน</span>
          <span>
            {latestAttendance?.checkOutTime
              ? new Date(latestAttendance.checkOutTime).toLocaleTimeString()
              : 'N/A'}
          </span>
        </div>
      </div>
      <div className="w-full">
        <h2 className="font-bold">ประวัติการทำงาน</h2>
        <Calendar mode="single" className="border rounded-md" />
      </div>
      <div className="flex flex-col w-full space-y-2">
        <div className="flex justify-between">
          <span>จำนวนวันทำงานทั้งหมด</span>
          <Input
            value={userData.totalWorkingDays.toString()}
            readOnly
            className="w-16"
          />
        </div>
        <div className="flex justify-between">
          <span>จำนวนวันที่มาทำงาน</span>
          <Input
            value={userData.totalPresent.toString()}
            readOnly
            className="w-16"
          />
        </div>
        <div className="flex justify-between">
          <span>จำนวนวันที่ลา</span>
          <Input
            value={userData.totalAbsent.toString()}
            readOnly
            className="w-16"
          />
        </div>
        <div className="flex justify-between">
          <span>จำนวนชั่วโมงล่วงเวลา OT</span>
          <Input
            value={`${userData.overtimeHours} Hr`}
            readOnly
            className="w-16"
          />
        </div>
        <div className="flex justify-between">
          <span>วันลาคงเหลือ</span>
          <Input
            value={userData.balanceLeave.toString()}
            readOnly
            className="w-16"
          />
        </div>
      </div>
    </div>
  );
}
