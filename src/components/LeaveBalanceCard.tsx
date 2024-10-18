import React from 'react';
import { Calendar, Briefcase, Umbrella } from 'lucide-react';

interface LeaveBalanceData {
  sickLeave: number;
  businessLeave: number;
  annualLeave: number;
}

interface LeaveBalanceCardProps {
  leaveBalance: LeaveBalanceData;
}

const LeaveBalanceCard: React.FC<LeaveBalanceCardProps> = ({
  leaveBalance,
}) => {
  const leaveTypes = [
    {
      type: 'ลาป่วย',
      icon: <Umbrella className="w-6 h-6" />,
      balance: leaveBalance.sickLeave,
    },
    {
      type: 'ลากิจ',
      icon: <Briefcase className="w-6 h-6" />,
      balance: leaveBalance.businessLeave,
    },
    {
      type: 'ลาพักร้อน',
      icon: <Calendar className="w-6 h-6" />,
      balance: leaveBalance.annualLeave,
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">วันลาคงเหลือ</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {leaveTypes.map((leave) => (
          <div
            key={leave.type}
            className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg"
          >
            <div className="p-2 bg-red-100 rounded-full">{leave.icon}</div>
            <div>
              <p className="text-sm font-medium text-gray-600">{leave.type}</p>
              <p className="text-lg font-bold text-gray-800">
                {leave.balance} วัน
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeaveBalanceCard;
