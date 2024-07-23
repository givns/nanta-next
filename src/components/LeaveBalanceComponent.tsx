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
  const [isLoading, setIsLoading] = useState(true);

  console.log('LeaveBalanceComponent rendered with userId:', userId);

  useEffect(() => {
    console.log('LeaveBalanceComponent useEffect triggered');
    const fetchLeaveBalance = async () => {
      try {
        console.log('Fetching leave balance for userId:', userId);
        const response = await axios.get<LeaveBalanceData>(
          `/api/checkLeaveBalance?userId=${userId}`,
        );
        console.log('Leave balance response:', response.data);
        setLeaveBalance(response.data);
        onBalanceLoaded(response.data);
      } catch (error) {
        console.error('Error fetching leave balance:', error);
        setError('Error fetching leave balance');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaveBalance();
  }, [userId, onBalanceLoaded]);

  if (isLoading) {
    console.log('LeaveBalanceComponent is still loading');
    return <div>Loading leave balance...</div>;
  }

  if (error) {
    console.log('LeaveBalanceComponent encountered an error:', error);
    return <div>{error}</div>;
  }

  console.log('Rendering LeaveBalanceComponent content');

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
