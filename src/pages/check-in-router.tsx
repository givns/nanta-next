import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import CheckInOutForm from '../components/CheckInOutForm';

interface UserData {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeNumber: string | null;
  profilePictureUrl: string | null;
  createdAt: Date;
}

const CheckInRouter: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState<'checkin' | 'checkout' | null>(
    null,
  );
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { lineUserId } = router.query;

  useEffect(() => {
    const fetchUserStatusAndData = async () => {
      if (!lineUserId || typeof lineUserId !== 'string') return;

      try {
        const response = await axios.get(
          `/api/check-status?lineUserId=${lineUserId}`,
        );
        const { status, checkInId, userData } = response.data;
        setUserStatus(status);
        setCheckInId(checkInId);
        setUserData(userData);
      } catch (error) {
        console.error('Error fetching user status and data:', error);
        setError('Failed to fetch user data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserStatusAndData();
  }, [lineUserId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
          role="alert"
        >
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div
          className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative"
          role="alert"
        >
          <strong className="font-bold">Warning!</strong>
          <span className="block sm:inline"> User data not found.</span>
        </div>
      </div>
    );
  }

  const isCheckingIn = userStatus === 'checkin';

  return (
    <CheckInOutForm
      userData={userData}
      checkInId={checkInId}
      isCheckingIn={isCheckingIn}
    />
  );
};

export default CheckInRouter;
