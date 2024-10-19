import React, { useEffect, useState } from 'react';
import OvertimeRequestForm from '../components/OvertimeRequestForm';
import liff from '@line/liff';
import SkeletonLoader from '../components/SkeletonLoader';
import axios from 'axios';
import { UserData } from '@/types/user';

const OvertimeRequestPage: React.FC = () => {
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          await fetchUserData(profile.userId);
        } else {
          liff.login();
        }

        setIsLiffReady(true);
      } catch (error) {
        console.error('Failed to initialize LIFF:', error);
        setError(
          'Failed to initialize LIFF or get user profile. Please try again.',
        );
      }
    };

    initLiff();
  }, []);

  const fetchUserData = async (lineUserId: string) => {
    try {
      const response = await axios.get(
        `/api/user-data?lineUserId=${lineUserId}`,
      );
      setUserData(response.data.user);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to fetch user data. Please try again.');
    }
  };

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-xl mb-6 text-gray-800">Error</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!isLiffReady || !lineUserId || !userData) {
    return <SkeletonLoader />;
  }

  return (
    <div className="overtime-request-page">
      <OvertimeRequestForm
        liff={liff}
        lineUserId={lineUserId}
        userData={userData}
      />
    </div>
  );
};

export default OvertimeRequestPage;
