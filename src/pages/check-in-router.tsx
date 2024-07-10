import React, { useState, useEffect, useCallback } from 'react';
import CheckInOutForm from '../components/CheckInOutForm';
import {
  UserData,
  AttendanceStatus,
  UserResponse,
  ShiftData,
} from '../types/user';
import axios from 'axios';
import liff from '@line/liff';
import ErrorBoundary from '../components/ErrorBoundary';

const CheckInRouter: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
  );

  const fetchUserData = useCallback(async (lineUserId: string) => {
    try {
      console.log('Fetching user data...');
      const response = await axios.get<UserResponse>('/api/users', {
        params: { lineUserId },
      });
      console.log('User data response:', response.data);

      const { user, attendanceStatus: fetchedAttendanceStatus } = response.data;
      setUserData(user);

      // Ensure the assignedShift is of type ShiftData | null
      const safeAssignedShift: ShiftData | null = user.assignedShift || null;

      // Create a new AttendanceStatus with the safe assignedShift
      const newAttendanceStatus: AttendanceStatus = {
        ...fetchedAttendanceStatus,
        user: {
          ...fetchedAttendanceStatus.user,
          assignedShift: safeAssignedShift,
        },
      };

      setAttendanceStatus(newAttendanceStatus);

      console.log('States updated:', {
        userData: user,
        attendanceStatus: newAttendanceStatus,
      });
    } catch (error) {
      console.error('Error fetching user data:', error);
      setMessage('Failed to load user data. Please try again.');
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

  if (!userData || !attendanceStatus) {
    console.log(
      'Still loading. userData:',
      !!userData,
      'attendanceStatus:',
      !!attendanceStatus,
    );
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">กำลังเข้าสู่ระบบ...</h1>
        {message && <p className="text-red-500">{message}</p>}
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
