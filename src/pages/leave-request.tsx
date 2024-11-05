import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LeaveRequestForm, { FormValues } from '../components/LeaveRequestForm';
import axios from 'axios';
import { UserData } from '@/types/user';
import { LeaveBalanceData } from '@/types/LeaveService';
import LoadingBar from '@/components/LoadingBar';

interface LeaveRequestPageProps {
  lineUserId: string | null;
}

interface UserCheckInStatusResponse {
  user: UserData & {
    sickLeaveBalance: number;
    businessLeaveBalance: number;
    annualLeaveBalance: number;
  };
}

const LeaveRequestPage: React.FC<LeaveRequestPageProps> = ({ lineUserId }) => {
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
    const fetchData = async () => {
      if (!lineUserId) {
        setError('No LINE User ID available');
        setIsLoading(false);
        return;
      }

      try {
        // Updated to use headers
        const response = await fetch('/api/user-data', {
          headers: {
            'x-line-userid': lineUserId,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }

        const data = await response.json();
        if (!data || !data.user) {
          throw new Error('Failed to fetch user data');
        }

        setUserData(data.user);
        setLeaveBalance({
          sickLeave: data.user.sickLeaveBalance,
          businessLeave: data.user.businessLeaveBalance,
          annualLeave: data.user.annualLeaveBalance,
        });

        if (resubmit === 'true' && originalId) {
          // Update to use headers for leave request fetch
          const leaveResponse = await fetch(`/api/admin/leaves/${originalId}`, {
            headers: {
              'x-line-userid': lineUserId,
            },
          });
          const leaveData = await leaveResponse.json();
          setOriginalLeaveData(leaveData);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to fetch necessary data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [lineUserId, resubmit, originalId]);

  if (isLoading || !leaveBalance) {
    return (
      <div className="mt-8">
        <LoadingBar />
      </div>
    );
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
