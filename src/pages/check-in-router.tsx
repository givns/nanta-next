import React, { useState, useEffect, useCallback } from 'react';
import CheckInOutForm from '../components/CheckInOutForm';
import { UserData, AttendanceStatus } from '../types/user';
import axios from 'axios';
import liff from '@line/liff';
import ErrorBoundary from '../components/ErrorBoundary';

const CheckInRouter: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
  );

  const fetchAttendanceStatus = useCallback(async (employeeId: string) => {
    try {
      const response = await axios.get(
        `/api/check-status?employeeId=${employeeId}`,
      );
      setAttendanceStatus(response.data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching attendance status:', error);
      setMessage('Failed to fetch attendance status');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          const userResponse = await axios.get(
            `/api/users?lineUserId=${profile.userId}`,
          );
          setUserData(userResponse.data);
          await fetchAttendanceStatus(userResponse.data.employeeId);
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
        setMessage('Failed to initialize the application');
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, [fetchAttendanceStatus]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
      );
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

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
