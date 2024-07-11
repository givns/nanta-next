// pages/check-in-router.tsx

import React, { useState, useEffect } from 'react';
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
        } else {
          setError('Employee ID not found');
        }
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

  console.log('Rendering CheckInRouter', {
    isLoading,
    error,
    userData,
    attendanceStatus,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!userData || !attendanceStatus) {
    console.log('Missing data', { userData, attendanceStatus });
    return <div>No user data or attendance status available.</div>;
  }

  return (
    <ErrorBoundary>
      <div className="main-container flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4">
        <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
            {attendanceStatus.isCheckingIn ? 'Check In' : 'Check Out'}
          </h1>
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
