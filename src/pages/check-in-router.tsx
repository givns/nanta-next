import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';
import axios from 'axios';

const CheckInRouter = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          const lineUserId = profile.userId;

          // Check if user is already checked in
          const response = await axios.get(
            `/api/check-status?lineUserId=${lineUserId}`,
          );
          const { isCheckedIn } = response.data;

          if (isCheckedIn) {
            router.push('/check-out');
          } else {
            router.push('/check-in');
          }
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('Error in check-in routing:', error);
        // Handle error (e.g., show error message)
      } finally {
        setLoading(false);
      }
    };

    initializeLiff();
  }, [router]);

  if (loading) {
    return <div>กำลังเข้าสู่ระบบ...</div>;
  }

  return null;
};

export default CheckInRouter;
