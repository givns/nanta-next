import React, { useState, useEffect } from 'react';
import CheckInOutForm from '../components/CheckInOutForm';
import { UserData, AttendanceStatus } from '../types/user';
import axios from 'axios';
import liff from '@line/liff';
import { GetServerSideProps } from 'next';

interface CheckInRouterProps {
  userData: UserData | null;
  attendanceStatus: AttendanceStatus | null;
  errorMessage: string | null;
}

const CheckInRouter: React.FC<CheckInRouterProps> = ({
  userData,
  attendanceStatus,
  errorMessage,
}) => {
  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
      );
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  if (!userData || !attendanceStatus) {
    return (
      <div className="main-container flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4">
        <div className="flex flex-col justify-center items-center min-h-screen">
          <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg text-center">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">
              กำลังเข้าสู่ระบบ
              <br />
              กรุณารอสักครู่...
            </h1>
          </div>
        </div>
      </div>
    );
  }

  return (
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
        {errorMessage && (
          <div className="mb-4 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
            {errorMessage}
          </div>
        )}
        <CheckInOutForm userData={userData} />
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID!;
    await liff.init({ liffId });

    if (!liff.isLoggedIn()) {
      return {
        props: {
          userData: null,
          attendanceStatus: null,
          errorMessage: 'User not logged in',
        },
      };
    }

    const profile = await liff.getProfile();
    const lineUserId = profile.userId;

    // Fetch user data from your API
    const userResponse = await axios.get('/api/users', {
      params: { lineUserId },
    });

    const userData: UserData = userResponse.data;

    // Fetch attendance status
    const statusResponse = await axios.get('/api/check-status', {
      params: { employeeId: userData.employeeId },
    });

    const attendanceStatus: AttendanceStatus = statusResponse.data;

    return {
      props: {
        userData,
        attendanceStatus,
        errorMessage: null,
      },
    };
  } catch (error) {
    console.error('Error fetching user data or attendance status:', error);
    return {
      props: {
        userData: null,
        attendanceStatus: null,
        errorMessage: 'Failed to load user data or attendance status',
      },
    };
  }
};

export default CheckInRouter;
