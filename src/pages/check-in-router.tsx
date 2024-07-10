import React, { useState, useEffect, useCallback } from 'react';
import CheckInOutForm from '../components/CheckInOutForm';
import { UserData, AttendanceStatus, UserResponse } from '../types/user';
import axios from 'axios';
import liff from '@line/liff';
import ErrorBoundary from '../components/ErrorBoundary';

const CheckInRouter: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
  );

  const fetchUserData = useCallback(async (lineUserId: string) => {
    setIsLoading(true);
    try {
      console.log('Fetching user data...');
      const response = await axios.get<UserResponse>('/api/users', {
        params: { lineUserId },
      });
      console.log('User data response:', response.data);

      const { user, recentAttendance } = response.data;

      setUserData(user);

      const newAttendanceStatus: AttendanceStatus = {
        user: {
          id: user.id,
          employeeId: user.employeeId,
          name: user.name,
          departmentId: user.departmentId,
          assignedShift: user.assignedShift || null,
        },
        latestAttendance:
          recentAttendance.length > 0 ? recentAttendance[0] : null,
        isCheckingIn:
          recentAttendance.length === 0 || !!recentAttendance[0].checkOutTime,
        shiftAdjustment: null, // Assume no shift adjustment for now
      };

      setAttendanceStatus(newAttendanceStatus);
      console.log('States updated:', {
        userData: user,
        attendanceStatus: newAttendanceStatus,
      });
      setIsLoading(false);
      setMessage(null);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setMessage('Failed to load user data. Please try again.');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        console.log('Initializing LIFF...');
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        console.log('LIFF initialized successfully');

        if (liff.isLoggedIn()) {
          console.log('User is logged in, fetching profile...');
          const profile = await liff.getProfile();
          console.log('LINE User ID:', profile.userId);
          await fetchUserData(profile.userId);
        } else {
          console.log('User is not logged in, initiating login...');
          liff.login();
        }
      } catch (error: any) {
        console.error('Error initializing LIFF:', error);
        setMessage('An unexpected error occurred. Please try again later.');
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, [fetchUserData]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
      );
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  console.log('Render state:', {
    isLoading,
    userData,
    attendanceStatus,
    message,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">กำลังเข้าสู่ระบบ...</h1>
      </div>
    );
  }

  if (!userData || !attendanceStatus) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">ไม่พบข้อมูลผู้ใช้</h1>
        {message && <p className="text-red-500">{message}</p>}
        <button
          onClick={() => liff.login()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
        >
          เข้าสู่ระบบอีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="main-container flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4">
        <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
            {attendanceStatus.isCheckingIn
              ? 'ระบบบันทึกเวลาเข้างาน'
              : 'ระบบบันทึกเวลาออกงาน'}
          </h1>
          <div className="text-3xl font-bold text-center mb-8 text-black-950">
            {currentTime}
          </div>
          {message && (
            <div className="mb-4 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
              {message}
            </div>
          )}
          <CheckInOutForm
            userData={userData}
            initialAttendanceStatus={attendanceStatus}
            onStatusChange={(newStatus) =>
              setAttendanceStatus((prev) =>
                prev ? { ...prev, isCheckingIn: newStatus } : null,
              )
            }
          />
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default CheckInRouter;
