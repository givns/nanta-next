import { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import liff from '@line/liff';
import axios from 'axios';
import ConsolidatedApprovalDashboard from '../components/ConsolidatedApprovalDashboard';

interface ApprovalDashboardProps {
  liffId: string;
}

const ApprovalDashboard: React.FC<ApprovalDashboardProps> = ({ liffId }) => {
  const [userData, setUserData] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiffAndFetchData = async () => {
      try {
        if (!liffId) {
          throw new Error('LIFF ID is not defined');
        }

        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const lineUserId = profile.userId;

        // Check authorization
        const authResponse = await axios.get('/api/check-authorization', {
          headers: { 'x-line-userid': lineUserId },
        });
        setIsAuthorized(authResponse.data.isAuthorized);

        if (authResponse.data.isAuthorized) {
          const userResponse = await axios.get(
            `/api/user-data?lineUserId=${lineUserId}`,
          );
          setUserData(userResponse.data.user);
        } else {
          setError('คุณไม่ได้รับสิทธิการเข้าถึง');
        }
      } catch (err) {
        console.error('Error during initialization or data fetching:', err);
        setError('Failed to initialize LIFF or fetch user data');
      }
    };

    initializeLiffAndFetchData();
  }, [liffId]);

  if (error) {
    return <div>{error}</div>;
  }

  if (!isAuthorized) {
    return <div>คุณไม่ได้รับสิทธิการเข้าถึง</div>;
  }

  if (!userData) {
    return <div>Loading...</div>;
  }

  return <ConsolidatedApprovalDashboard userData={userData} />;
};

export const getServerSideProps: GetServerSideProps = async () => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  if (!liffId) {
    throw new Error('LIFF ID is not defined');
  }

  return { props: { liffId } };
};

export default ApprovalDashboard;
