import React from 'react';
import CheckOutForm from '../components/CheckOutForm';

const CheckOutPage = () => {
  const checkInId = 'your_check_in_id';
  const lineUserId = 'your_line_user_id';

  return <CheckOutForm checkInId={checkInId} lineUserId={lineUserId} />;
};

export default CheckOutPage;
