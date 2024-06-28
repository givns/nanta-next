import { useEffect, useState } from 'react';
import liff from '@line/liff';
import axios from 'axios';
import dynamic from 'next/dynamic';

const CheckInForm = dynamic(() => import('../components/CheckInForm'));
const CheckOutForm = dynamic(() => import('../components/CheckOutForm'));

const CheckInRouter = () => {
  const [loading, setLoading] = useState(true);
  const [componentToRender, setComponentToRender] =
    useState<JSX.Element | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          const lineUserId = profile.userId;

          // Check user's check-in status
          const response = await axios.get(
            `/api/check-status?lineUserId=${encodeURIComponent(lineUserId)}`,
          );
          const { status, checkInId } = response.data;

          if (status === 'checkout') {
            setComponentToRender(
              <CheckOutForm checkInId={checkInId} lineUserId={lineUserId} />,
            );
          } else {
            setComponentToRender(<CheckInForm lineUserId={lineUserId} />);
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
  }, []);

  if (loading) {
    return (
      <div>
        กำลังเข้าสู่ระบบ... <br /> โปรดรอสักครู่
      </div>
    );
  }

  return componentToRender;
};

export default CheckInRouter;
