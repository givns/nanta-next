import { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import liff from '@line/liff';
import axios from 'axios';
import ConsolidatedApprovalDashboard from '../components/ConsolidatedApprovalDashboard';
import { User } from '@prisma/client';

interface ApprovalDashboardProps {
  liffId: string;
}

const ApprovalDashboard: React.FC<ApprovalDashboardProps> = ({ liffId }) => {
  const [userData, setUserData] = useState<User | null>(null);
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
        const userResponse = await axios.get(
          `/api/user-data?lineUserId=${profile.userId}`,
        );
        const user = userResponse.data.user;
        setUserData(user);
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

  if (!userData) {
    return <div>Loading...</div>;
  }

  if (userData.role !== 'Admin' && userData.role !== 'SuperAdmin') {
    return <div>คุณไม่ได้รับสิทธิการเข้าถึง</div>;
  }

  return (
    <ConsolidatedApprovalDashboard
      userData={{
        employeeId: userData.employeeId,
        role: userData.role,
        departmentId: userData.departmentId ?? '',
        lineUserId: userData.lineUserId ?? '',
      }}
    />
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  if (!liffId) {
    throw new Error('LIFF ID is not defined');
  }

  return { props: { liffId } };
};

export default ApprovalDashboard;
