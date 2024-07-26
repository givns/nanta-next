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

          if (resubmit === 'true' && originalId) {
            await fetchOriginalLeaveRequest(originalId as string);
          }

          setIsLoading(false);
        }
      } catch (err) {
        console.error('LIFF initialization failed', err);
        setError('Failed to initialize LIFF');
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, [resubmit, originalId]);

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
      // Set originalLeaveData to null in case of an error
      setOriginalLeaveData(null);
    }
  };

  if (isLoading) {
    console.log('Still loading...');
    return <div>Loading...</div>;
  }

  if (error) {
    console.log('Error occurred:', error);
    return <div>Error: {error}</div>;
  }

  if (!userData) {
    console.log('No user data available');
    return <div>No user data available.</div>;
  }

  console.log('Rendering LeaveRequestForm with userData:', userData);

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-box shadow-md p-6">
          <h1 className="text-2xl font-bold mb-4 text-center">แบบฟอร์มขอลา</h1>
          <LeaveRequestForm
            initialData={originalLeaveData || undefined}
            isResubmission={resubmit === 'true'}
            userData={userData}
          />
        </div>
      </div>
    </div>
  );
};

export default LeaveRequestPage;
