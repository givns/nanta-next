// pages/admin-dashboard.tsx

import React, { useState, useEffect } from 'react';
import AdminShiftAdjustmentForm from '../components/AdminShiftAdjustmentForm';
import UserShiftInfo from '../components/UserShiftInfo';
import axios from 'axios';
import liff from '@line/liff';
import { UserData, AttendanceStatus } from '../types/user';

const AdminDashboard: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus | null>(null);
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiffAndFetchData = async () => {
      try {
        console.log('Starting LIFF initialization');
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          throw new Error('LIFF ID is not defined');
        }

        await liff.init({ liffId });
        console.log('LIFF initialized successfully');

        if (!liff.isLoggedIn()) {
          console.log('User not logged in, redirecting to login');
          liff.login();
          return;
        }

        console.log('Fetching user profile');
        const profile = await liff.getProfile();
        console.log('User profile:', profile);

        console.log('Fetching user data');
        const userResponse = await axios.get(
          `/api/users?lineUserId=${profile.userId}`,
        );
        const user = userResponse.data.user;
        console.log('User data:', user);
        setUserData(user);

        if (user.employeeId) {
          console.log('Fetching attendance status');
          const statusResponse = await axios.get(
            `/api/check-status?employeeId=${user.employeeId}`,
          );
          console.log('Attendance status:', statusResponse.data);
          setAttendanceStatus(statusResponse.data);
        }

        const [depResponse, shiftResponse] = await Promise.all([
          axios.get('/api/departments'),
          axios.get('/api/shifts'),
        ]);
        setDepartments(depResponse.data);
        setShifts(shiftResponse.data);
      } catch (err) {
        console.error('Error in initialization or data fetching:', err);
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred',
        );
      } finally {
        setIsLoading(false);
      }
    };

    initializeLiffAndFetchData();
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!userData || !attendanceStatus) {
    return <div>No user data available</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>

      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <UserShiftInfo
          userData={userData}
          attendanceStatus={attendanceStatus}
          departmentName={userData.department}
          isOutsideShift={() => false}
        />
      </div>

      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <h2 className="text-xl font-semibold mb-4">Shift Adjustment</h2>
        <AdminShiftAdjustmentForm
          lineUserId={userData.lineUserId}
          departments={departments}
          shifts={shifts}
        />
      </div>
    </div>
  );
};

export default AdminDashboard;
