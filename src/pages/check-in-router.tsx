import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import liff from '@line/liff';

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

          // Fetch user role from your API
          const response = await axios.get(
            `/api/user-role?lineUserId=${lineUserId}`,
          );
          const userRole = response.data.role;

          // Redirect based on user role
          if (userRole === 'DRIVER') {
            router.push('/driver-check-in');
          } else {
            router.push('/general-check-in');
          }
        } else {
          // If not logged in, redirect to login page or prompt LINE login
          liff.login();
        }
      } catch (error) {
        console.error('Error in check-in routing:', error);
        // Handle error (e.g., show error message, redirect to error page)
      } finally {
        setLoading(false);
      }
    };

    initializeLiff();
  }, [router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  // This component doesn't render anything itself, it just redirects
  return null;
};

export default CheckInRouter;
