import React, { useEffect, useState } from 'react';
import axios from 'axios';

const OvertimeBalance = ({ userId }: { userId: string }) => {
  const [overtimeBalance, setOvertimeBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOvertimeBalance = async () => {
      try {
        const response = await axios.get(`/api/checkOvertimeBalance?userId=${userId}`);
        setOvertimeBalance(response.data.totalOvertimeHours);
      } catch (error) {
        setError('Error fetching overtime balance');
        console.error(error);
      }
    };

    fetchOvertimeBalance();
  }, [userId]);

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div>
      <h2>Overtime Balance</h2>
      {overtimeBalance !== null ? <p>Total Overtime Hours: {overtimeBalance}</p> : <p>Loading...</p>}
    </div>
  );
};

export default OvertimeBalance;