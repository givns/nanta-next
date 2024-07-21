import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface LeaveBalanceData {
  sickLeave: number;
  businessLeave: number;
  annualLeave: number;
  overtimeLeave: number;
  totalLeaveDays: number;
}

interface LeaveBalanceProps {
  userId: string;
  onBalanceLoaded: (balance: LeaveBalanceData) => void;
}

const LeaveBalanceComponent: React.FC<LeaveBalanceProps> = ({
  userId,
  onBalanceLoaded,
}) => {
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceData | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaveBalance = async () => {
      try {
        const response = await axios.get<LeaveBalanceData>(
          `/api/checkLeaveBalance?userId=${userId}`,
        );
        setLeaveBalance(response.data);
        onBalanceLoaded(response.data);
      } catch (error) {
        setError('Error fetching leave balance');
        console.error(error);
      }
    };

    fetchLeaveBalance();
  }, [userId, onBalanceLoaded]);

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div>
      <h2>Leave Balance</h2>
      {leaveBalance ? (
        <>
          <p>Sick Leave: {leaveBalance.sickLeave}</p>
          <p>Business Leave: {leaveBalance.businessLeave}</p>
          <p>Annual Leave: {leaveBalance.annualLeave}</p>
          <p>Overtime Leave: {leaveBalance.overtimeLeave}</p>
          <p>Total Leave Days: {leaveBalance.totalLeaveDays}</p>
        </>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default LeaveBalanceComponent;
