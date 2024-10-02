import React, { useEffect, useState } from 'react';
import OvertimeRequestForm from '../components/OvertimeRequestForm';
import liff from '@line/liff';
import SkeletonLoader from '../components/SkeletonLoader';

const OvertimeRequestPage: React.FC = () => {
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        } else {
          liff.login(); // Redirect to LINE login if not logged in
        }

        setIsLiffReady(true);
        console.log('LIFF initialized in OvertimeRequestPage');
      } catch (error) {
        console.error(
          'Failed to initialize LIFF in OvertimeRequestPage:',
          error,
        );
        setError(
          'Failed to initialize LIFF or get user profile. Please try again.',
        );
      }
    };

    initLiff();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-xl mb-6 text-gray-800">Error</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!isLiffReady || !lineUserId) {
    return <SkeletonLoader />;
  }

  return (
    <div className="overtime-request-page">
      <OvertimeRequestForm liff={liff} lineUserId={lineUserId} />
    </div>
  );
};

export default OvertimeRequestPage;
