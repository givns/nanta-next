import React, { useEffect, useState } from 'react';
import axios from 'axios';
import CheckInOutForm from '../components/CheckInOutForm';
import { initializeLiff, getLiffProfile, liff } from '../utils/liff';
import { UserData } from '@/types/user';

const CheckInRouter: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState<'checkin' | 'checkout' | null>(
    null,
  );
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserStatusAndData = async () => {
      try {
        console.log('Initializing LIFF...');
        await initializeLiff();
        console.log('LIFF initialized successfully');

        if (!liff.isLoggedIn()) {
          console.log('User not logged in, redirecting to login...');
          liff.login();
          return;
        }

        console.log('Getting LIFF profile...');
        const profile = await getLiffProfile();
        console.log('LIFF profile retrieved:', profile);

        const lineUserId = profile.userId;
        console.log(
          'Fetching user status and data for lineUserId:',
          lineUserId,
        );

        const response = await axios.get(
          `/api/check-status?lineUserId=${lineUserId}`,
        );
        console.log('User status and data received:', response.data);

        const { status, checkInId, userData, message } = response.data;
        setUserStatus(status);
        setCheckInId(checkInId);
        setUserData(userData);
        setMessage(message || null);
      } catch (error) {
        console.error('Error in fetchUserStatusAndData:', error);
        if (axios.isAxiosError(error) && error.response) {
          setError(
            `Failed to fetch user data: ${error.response.data.message || error.message}`,
          );
        } else {
          setError('An unexpected error occurred. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUserStatusAndData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
          role="alert"
        >
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div
          className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative"
          role="alert"
        >
          <strong className="font-bold">Warning!</strong>
          <span className="block sm:inline"> User data not found.</span>
        </div>
      </div>
    );
  }

  const isCheckingIn = userStatus === 'checkin';

  return (
    <div className="main-container flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          {isCheckingIn ? 'ระบบบันทึกเวลาเข้างาน' : 'ระบบบันทึกเวลาออกงาน'}
        </h1>
        <div className="text-6xl font-bold text-center mb-8 text-blue-600">
          {new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}
        </div>
        {message && (
          <div className="mb-4 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
            {message}
          </div>
        )}
        <CheckInOutForm
          userData={userData}
          isCheckingIn={isCheckingIn}
          checkInId={isCheckingIn ? undefined : checkInId || undefined}
        />
      </div>
    </div>
  );
};

export default CheckInRouter;
