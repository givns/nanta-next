import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface LeaveBalanceData {
  sickLeave: number;
  businessLeave: number;
  annualLeave: number;
  totalLeaveDays: number;
}

interface LeaveBalanceProps {
  employeeId: string;
  onBalanceLoaded: (balance: LeaveBalanceData) => void;
}

const LeaveBalanceComponent: React.FC<LeaveBalanceProps> = ({
  employeeId,
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
          `/api/leave-balance?userId=${employeeId}`,
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
  }, [employeeId, onBalanceLoaded]);

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
    <div>
      <h2 className="text-xl font-bold mb-4">วันลาคงเหลือ</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p>Sick Leave:</p>
          <p>Business Leave:</p>
          <p>Annual Leave:</p>
          <p className="font-bold">Total Leave Days:</p>
        </div>
        <div>
          <p>{leaveBalance.sickLeave} days</p>
          <p>{leaveBalance.businessLeave} days</p>
          <p>{leaveBalance.annualLeave} days</p>
          <p className="font-bold">{leaveBalance.totalLeaveDays} days</p>
        </div>
      </div>
    </div>
  );
};

export default LeaveBalanceComponent;
