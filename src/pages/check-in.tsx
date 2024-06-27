import React from 'react';
import { useRouter } from 'next/router';
import CheckInForm from '../components/CheckInForm';

const CheckInPage = () => {
  const router = useRouter();
  const { lineUserId } = router.query;

  if (!lineUserId) {
    return <div>Loading...</div>;
  }

  return <CheckInForm lineUserId={lineUserId as string} />;
};

export default CheckInPage;
