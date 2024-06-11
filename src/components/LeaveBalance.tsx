import React, { useEffect, useState } from 'react';
import axios from 'axios';

const LeaveBalance = ({ userId }: { userId: string }) => {
  const [leaveBalance, setLeaveBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaveBalance = async () => {
      try {
        const response = await axios.get(
          `/api/checkLeaveBalance?userId=${userId}`,
        );
        setLeaveBalance(response.data.totalLeaveDays);
      } catch (error) {
        setError('Error fetching leave balance');
        console.error(error);
      }
    };

    fetchLeaveBalance();
  }, [userId]);

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div>
      <h2>Leave Balance</h2>
      {leaveBalance !== null ? (
        <p>Total Leave Days: {leaveBalance}</p>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default LeaveBalance;
