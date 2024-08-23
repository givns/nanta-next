import React, { useState, useEffect } from 'react';
import AdminShiftAdjustmentForm from '../components/AdminShiftAdjustmentForm';
import axios from 'axios';
import liff from '@line/liff';

interface UserDetails {
  user: {
    lineUserId: string;
  };
  departments: { id: string; name: string }[];
  shifts: { id: string; name: string }[];
}

const AdminDashboard: React.FC = () => {
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiffAndFetchData = async () => {
      try {
        console.log('Starting LIFF initialization');
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
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
        const response = await axios.get(
          `/api/users?lineUserId=${profile.userId}`,
        );
        console.log('User data response:', response.data);
        setUserDetails(response.data);
      } catch (err) {
        console.error('Error in initialization or data fetching:', err);
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred',
        );
      } finally {
        setIsLoading(false);
      }
    };

    initializeLiffAndFetchData();
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!userDetails) {
    return <div>No user data available</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Shift Adjustment</h1>
      <AdminShiftAdjustmentForm lineUserId={userDetails.user.lineUserId} />
      {/* Add the lineUserId prop */}
    </div>
  );
};

export default AdminDashboard;
