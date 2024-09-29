import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LeaveRequestForm, { FormValues } from '../components/LeaveRequestForm';
import liff from '@line/liff';
import axios from 'axios';
import { UserData } from '@/types/user';
import { LeaveBalanceData } from '@/types/LeaveService';

const LeaveRequestPage: React.FC = () => {
  const router = useRouter();
  const { resubmit, originalId } = router.query;
  const [originalLeaveData, setOriginalLeaveData] = useState<FormValues | null>(
    null,
  );
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceData | null>(
    null,
  );

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
        }
      } catch (err) {
        console.error('LIFF initialization failed', err);
        setError('Failed to initialize LIFF');
      } finally {
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, [resubmit, originalId]);

  const fetchUserData = async (lineUserId: string) => {
    try {
      const response = await axios.get(
        `/api/user-check-in-status?lineUserId=${lineUserId}`,
      );
      console.log('User data response:', response.data);
      if (!response.data || !response.data.user) {
        throw new Error('Failed to fetch user data');
      }
      setUserData(response.data.user);
      if (response.data.leaveBalance) {
        setLeaveBalance(response.data.leaveBalance);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError(
        error instanceof Error ? error.message : 'An unknown error occurred',
      );
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
      setOriginalLeaveData(null);
    }
  };

  if (isLoading || !leaveBalance) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!userData) {
    return <div>No user data available.</div>;
  }

  return (
    <div className="main-container flex flex-col min-h-screen bg-gray-100 p-4">
      <div className="flex-grow flex flex-col justify-start items-center">
        <div className="w-full max-w-md">
          <LeaveRequestForm
            initialData={originalLeaveData || undefined}
            isResubmission={resubmit === 'true'}
            userData={userData}
            leaveBalance={leaveBalance}
          />
        </div>
      </div>
    </div>
  );
};

export default LeaveRequestPage;
