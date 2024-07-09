import React, { useState, useEffect } from 'react';
import CheckInOutForm from '../components/CheckInOutForm';
import { UserData, AttendanceStatus } from '../types/user';
import axios from 'axios';
import liff from '@line/liff';

const CheckInRouter: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
  );
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState<boolean | null>(null);
  const [fetchedUserData, setFetchedUserData] = useState<UserData | null>(null);
  const [statusResponse, setStatusResponse] = useState<AttendanceStatus | null>(
    null,
  );

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        console.log('Initializing LIFF...');
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        console.log('LIFF initialized successfully');

        if (liff.isLoggedIn()) {
          console.log('User is logged in, fetching profile...');
          const profile = await liff.getProfile();
          const lineUserId = profile.userId;
          console.log('LINE User ID:', lineUserId);

          console.log('Fetching user data...');
          const userResponse = await axios.get<UserData>('/api/users', {
            params: { lineUserId },
          });
          console.log('User data response:', userResponse.data);
          setUserData(userResponse.data);

          if (userResponse.data && userResponse.data.employeeId) {
            console.log('Employee ID found:', userResponse.data.employeeId);

            console.log('Fetching initial attendance status...');
            const statusResponse = await axios.get<AttendanceStatus>(
              '/api/check-status',
              {
                params: { employeeId: userResponse.data.employeeId },
              },
            );
            console.log('Attendance status response:', statusResponse.data);
            setAttendanceStatus(statusResponse.data);
            setIsCheckingIn(statusResponse.data.isCheckingIn);
          } else {
            console.error('Employee ID not found in user data');
            setMessage('Employee ID not found. Please contact support.');
          }
        } else {
          console.log('User is not logged in, initiating login...');
          liff.login();
        }
      } catch (error: any) {
        console.error('Error initializing LIFF or fetching data:', error);
        if (axios.isAxiosError(error) && error.response) {
          console.error('Error response:', error.response.data);
          setMessage(
            error.response.data.message ||
              'Failed to load user data or attendance status',
          );
        } else {
          setMessage('An unexpected error occurred. Please try again later.');
        }
      }
    };

    initializeLiff();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
      );
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (fetchedUserData && statusResponse) {
      setUserData(fetchedUserData);
      setAttendanceStatus(statusResponse);
      setIsCheckingIn(statusResponse.isCheckingIn);
      console.log('States updated');
    }
  }, [fetchedUserData, statusResponse]);

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
    <div className="main-container flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          {isCheckingIn ? 'ระบบบันทึกเวลาเข้างาน' : 'ระบบบันทึกเวลาออกงาน'}
        </h1>
        <div className="text-3xl font-bold text-center mb-8 text-black-950">
          {currentTime}
        </div>
        {message && (
          <div className="mb-4 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
            {message}
          </div>
        )}
        {userData && attendanceStatus && (
          <>
            {console.log('Rendering CheckInOutForm with:', {
              userData,
              attendanceStatus,
            })}
            <CheckInOutForm
              userData={userData}
              initialAttendanceStatus={attendanceStatus}
              onStatusChange={(newStatus) => setIsCheckingIn(newStatus)}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default CheckInRouter;
