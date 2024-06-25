import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';
import axios from 'axios';
import EnhancedCheckInForm from '../components/EnhancedCheckInForm';

const CheckInPage: React.FC = () => {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<
    | 'DRIVER'
    | 'REGULAR'
    | 'ADMIN'
    | 'OPERATION'
    | 'GENERAL'
    | 'SUPERADMIN'
    | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);

          // Fetch user data from your API
          try {
            const response = await axios.get(`/api/user/${profile.userId}`);
            setUserRole(response.data.role);
          } catch (err) {
            console.error('Error fetching user data:', err);
            setError('Failed to fetch user data. Please try again.');
          }
        } else {
          liff.login();
        }
      } catch (err) {
        console.error('Error initializing LIFF:', err);
        setError('Failed to initialize LIFF. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (!lineUserId || !userRole) {
    return <div>Unable to fetch user data. Please try again.</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Employee Check-In</h1>
      <EnhancedCheckInForm lineUserId={lineUserId} userRole={userRole} />
    </div>
  );
};

export default CheckInPage;
