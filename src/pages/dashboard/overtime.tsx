// pages/dashboard/overtime.tsx

import { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import liff from '@line/liff';
import axios from 'axios';
import OvertimeDashboard from '../../components/OvertimeDashboard';
import { User } from '@prisma/client';

interface OvertimePageProps {
  liffId: string;
}

const OvertimePage: React.FC<OvertimePageProps> = ({ liffId }) => {
  const [userData, setUserData] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiffAndFetchData = async () => {
      try {
        console.log('Starting LIFF initialization');
        if (!liffId) {
          throw new Error('LIFF ID is not defined');
        }

        await liff.init({ liffId });
        console.log('LIFF initialized successfully');

        if (!liff.isLoggedIn()) {
          console.log('User not logged in, redirecting to login');
          liff.login();
          return;
        }

        console.log('Fetching user profile');
        const profile = await liff.getProfile();
        console.log('User profile:', profile);

        console.log('Fetching user data');
        const userResponse = await axios.get(
          `/api/users?lineUserId=${profile.userId}`,
        );
        const user = userResponse.data.user;
        console.log('User data:', user);
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
    return <div>You are not authorized to view this page.</div>;
  }

  return (
    <OvertimeDashboard
      userId={userData.id}
      userRole={userData.role}
      userDepartmentId={userData.departmentId}
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

export default OvertimePage;
