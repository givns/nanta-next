import { useEffect, useState } from 'react';
import liff from '@line/liff';
import GeneralCheckInForm from '../components/GeneralCheckInForm';

const GeneralCheckInPage = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        if (liff.isLoggedIn()) {
          setIsLoggedIn(true);
        } else {
          // If not logged in, prompt LINE login
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

  if (!isLoggedIn) {
    return <div>Please log in to access the check-in form.</div>;
  }

  return (
    <div>
      <h1>General Check-In</h1>
      <GeneralCheckInForm lineUserId={''} />
    </div>
  );
};

export default GeneralCheckInPage;
