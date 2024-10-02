import React, { useEffect, useState } from 'react';
import OvertimeRequestForm from '../components/OvertimeRequestForm';
import liff from '@line/liff';
import SkeletonLoader from '../components/SkeletonLoader'; // Assuming you have this component

const OvertimeRequestPage: React.FC = () => {
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        if (!liff.isLoggedIn()) {
          liff.login(); // Redirect to LINE login if not logged in
        }
        setIsLiffReady(true);
        console.log('LIFF initialized in OvertimeRequestPage');
      } catch (error) {
        console.error(
          'Failed to initialize LIFF in OvertimeRequestPage:',
          error,
        );
        setError('Failed to initialize LIFF. Please try again.');
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

  if (!isLiffReady) {
    return <SkeletonLoader />; // Or any other loading component
  }

  return (
    <div className="overtime-request-page">
      <OvertimeRequestForm liff={liff} />
    </div>
  );
};

export default OvertimeRequestPage;
