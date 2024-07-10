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
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          throw new Error('LIFF ID is not defined');
        }

        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const userResponse = await axios.get(
          `/api/users?lineUserId=${profile.userId}`,
        );
        const user = userResponse.data.user;
        setUserData(user);

        if (user.employeeId) {
          const statusResponse = await axios.get(
            `/api/check-status?employeeId=${user.employeeId}`,
          );
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

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!userData || !attendanceStatus) {
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
