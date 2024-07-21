// pages/leave-request.tsx

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LeaveRequestForm, { FormValues } from '../components/LeaveRequestForm';
import liff from '@line/liff';
import { useUser } from '../context/UserContext';

const LeaveRequestPage: React.FC = () => {
  const router = useRouter();
  const { resubmit, originalId } = router.query;
  const [originalLeaveData, setOriginalLeaveData] = useState<FormValues | null>(
    null,
  );
  const { user, loading, error, login } = useUser();

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff
        .init({ liffId })
        .then(() => {
          if (liff.isLoggedIn()) {
            liff.getProfile().then((profile) => {
              login(profile.userId);
            });
          } else {
            liff.login();
          }
        })
        .catch((err) => console.error('Error initializing LIFF:', err));
    }
  }, [login]);

  useEffect(() => {
    if (resubmit === 'true' && originalId) {
      fetchOriginalLeaveRequest(originalId as string);
    }
  }, [resubmit, originalId]);

  const fetchOriginalLeaveRequest = async (id: string) => {
    try {
      const response = await fetch(`/api/leaveRequest/${id}`);
      if (response.ok) {
        const data = await response.json();
        setOriginalLeaveData(data);
      }
    } catch (error) {
      console.error('Error fetching original leave request:', error);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!user) return <div>Please log in</div>;

  return (
    <LeaveRequestForm
      initialData={originalLeaveData || undefined}
      isResubmission={resubmit === 'true'}
      lineUserId={user.lineUserId}
      userId={user.id}
    />
  );
};

export default LeaveRequestPage;
