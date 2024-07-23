import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LeaveRequestForm, { FormValues } from '../components/LeaveRequestForm';
import liff from '@line/liff';
import axios from 'axios';
import { UserData } from '@/types/user';

const LeaveRequestPage: React.FC = () => {
  const router = useRouter();
  const { resubmit, originalId } = router.query;
  const [originalLeaveData, setOriginalLeaveData] = useState<FormValues | null>(
    null,
  );
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        if (!liff.isLoggedIn()) {
          liff.login();
        } else {
          const profile = await liff.getProfile();
          await fetchUserData(profile.userId);
        }
      } catch (err) {
        console.error('LIFF initialization failed', err);
        setError('Failed to initialize LIFF');
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, []);

  const fetchUserData = async (lineUserId: string) => {
    try {
      const response = await axios.get(`/api/users?lineUserId=${lineUserId}`);
      console.log('User data response:', response.data);
      if (!response.data || !response.data.user) {
        throw new Error('Failed to fetch user data');
      }
      setUserData(response.data.user);

      if (resubmit === 'true' && originalId) {
        await fetchOriginalLeaveRequest(originalId as string);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError(
        error instanceof Error ? error.message : 'An unknown error occurred',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOriginalLeaveRequest = async (id: string) => {
    try {
      const response = await axios.get(`/api/leaveRequest/${id}`);
      if (response.data) {
        setOriginalLeaveData(response.data);
      }
    } catch (error) {
      console.error('Error fetching original leave request:', error);
      // We're not setting isLoading to false here because it's not a critical error
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!userData) {
    return <div>No user data available.</div>;
  }

  return (
    <LeaveRequestForm
      initialData={originalLeaveData || undefined}
      isResubmission={resubmit === 'true'}
      userData={userData}
    />
  );
};

export default LeaveRequestPage;
