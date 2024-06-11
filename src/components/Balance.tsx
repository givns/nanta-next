import React, { useEffect, useState } from 'react';

const Balance: React.FC = () => {
  const [leaveBalance, setLeaveBalance] = useState<number>(0);
  const [overtimeBalance, setOvertimeBalance] = useState<number>(0);

  useEffect(() => {
    const fetchBalances = async () => {
      try {
        const response = await fetch('/api/getBalances');
        const data = await response.json();
        setLeaveBalance(data.leaveBalance);
        setOvertimeBalance(data.overtimeBalance);
      } catch (error) {
        console.error('Error fetching balances:', error);
      }
    };

    fetchBalances();
  }, []);

  return (
    <div>
      <h1>Balances</h1>
      <p>Leave Balance: {leaveBalance} days</p>
      <p>Overtime Balance: {overtimeBalance} hours</p>
    </div>
  );
};

export default Balance;
