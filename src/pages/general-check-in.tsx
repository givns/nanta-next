import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';
import GeneralCheckInForm from '../components/GeneralCheckInForm';

const GeneralCheckInPage = () => {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };

    initializeLiff();
  }, []);

  if (!lineUserId) {
    return <div>Loading...</div>;
  }

  return <GeneralCheckInForm lineUserId={lineUserId} />;
};

export default GeneralCheckInPage;
