import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';
import DriverCheckInForm from '../components/DriverCheckInForm';

const DriverCheckInPage = () => {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        } else {
          // If not logged in, redirect to login page or prompt LINE login
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF', error);
        // Handle error (e.g., show error message)
      } finally {
        setLoading(false);
      }
    };

    initializeLiff();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!lineUserId) {
    return <div>Error: Unable to get LINE user ID</div>;
  }

  return (
    <div>
      <h1>Driver Check-In</h1>
      <DriverCheckInForm lineUserId={lineUserId} />
    </div>
  );
};

export default DriverCheckInPage;
