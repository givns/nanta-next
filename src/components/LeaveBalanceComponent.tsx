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

  useEffect(() => {
    const fetchLeaveBalance = async () => {
      try {
        const response = await axios.get<LeaveBalanceData>(
          `/api/checkLeaveBalance?userId=${userId}`,
        );
        setLeaveBalance(response.data);
        onBalanceLoaded(response.data);
      } catch (error) {
        console.error('Error fetching leave balance:', error);
        if (axios.isAxiosError(error)) {
          setError(
            `Error fetching leave balance: ${error.response?.data?.message || error.message}`,
          );
        } else {
          setError('An unexpected error occurred while fetching leave balance');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaveBalance();
  }, [userId, onBalanceLoaded]);

  if (isLoading) {
    return <div className="text-center">Loading leave balance...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center">{error}</div>;
  }

  if (!leaveBalance) {
    return <div className="text-center">No leave balance data available.</div>;
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
          <p>{leaveBalance.sickLeave} days</p>
          <p>{leaveBalance.businessLeave} days</p>
          <p>{leaveBalance.annualLeave} days</p>
          <p>{leaveBalance.overtimeLeave} hours</p>
          <p className="font-bold">{leaveBalance.totalLeaveDays} days</p>
        </div>
      </div>
    </div>
  );
};

export default LeaveBalanceComponent;
