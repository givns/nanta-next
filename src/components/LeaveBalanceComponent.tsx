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
          `/api/leave-balance?userId=${userId}`,
        );
        setLeaveBalance(response.data);
        onBalanceLoaded(response.data);
      } catch (error) {
        setError('Error fetching leave balance');
        console.error('Error fetching leave balance:', error);
      }
    };

    fetchLeaveBalance();
  }, [userId, onBalanceLoaded]);

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  if (!leaveBalance) {
    return <div>Loading leave balance...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Leave Balance</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p>Sick Leave:</p>
          <p>Business Leave:</p>
          <p>Annual Leave:</p>
          <p>Overtime Leave:</p>
          <p className="font-bold">Total Leave Days:</p>
        </div>
        <div>
          <p>{leaveBalance.sickLeave}</p>
          <p>{leaveBalance.businessLeave}</p>
          <p>{leaveBalance.annualLeave}</p>
          <p>{leaveBalance.overtimeLeave}</p>
          <p className="font-bold">{leaveBalance.totalLeaveDays}</p>
        </div>
      </div>
    </div>
  );
};

export default LeaveBalanceComponent;
