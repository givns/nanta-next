import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LeaveRequestForm, { FormValues } from '../components/LeaveRequestForm';
import liff from '@line/liff';

const LeaveRequestPage: React.FC = () => {
  const router = useRouter();
  const { resubmit, originalId } = router.query;
  const [originalLeaveData, setOriginalLeaveData] = useState<FormValues | null>(
    null,
  );
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff
        .init({ liffId })
        .then(() => {
          if (liff.isLoggedIn()) {
            liff.getProfile().then((profile) => {
              setLineUserId(profile.userId);
            });
          } else {
            liff.login();
          }
        })
        .catch((err) => console.error('Error initializing LIFF:', err));
    }
  }, []);

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

  return (
    <LeaveRequestForm
      initialData={originalLeaveData || undefined}
      isResubmission={resubmit === 'true'}
      lineUserId={lineUserId}
    />
  );
};

export default LeaveRequestPage;
