import React, { useEffect, useState } from 'react';
import axios from 'axios';
import CheckInOutForm from '../components/CheckInOutForm';
import { initializeLiff, getLiffProfile, liff } from '../utils/liff';
import { UserData } from '../types/user';

const CheckInRouter: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState<'checkin' | 'checkout' | null>(
    null,
  );
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);

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

        const { status, checkInId, userData } = response.data;
        setUserStatus(status);
        setCheckInId(checkInId);
        setUserData(userData);
      } catch (error) {
        console.error('Error in fetchUserStatusAndData:', error);
        setError('Failed to fetch user data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserStatusAndData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (!userData) {
    return <div>User data not found.</div>;
  }

  const isCheckingIn = userStatus === 'checkin';

  return (
    <CheckInOutForm
      userData={userData}
      checkInId={checkInId}
      isCheckingIn={isCheckingIn}
    />
  );
};

export default CheckInRouter;
