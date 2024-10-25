import React from 'react';
import { Calendar, Briefcase, Umbrella, Ban } from 'lucide-react';

interface LeaveBalanceData {
  sickLeave: number;
  businessLeave: number;
  annualLeave: number;
}

interface LeaveBalanceCardProps {
  leaveBalance: LeaveBalanceData;
  onSelectLeaveType?: (type: string) => void;
  selectedType?: string;
}

export default function LeaveBalanceCard({
  leaveBalance,
  onSelectLeaveType,
  selectedType,
}: LeaveBalanceCardProps) {
  const leaveTypes = [
    {
      type: 'ลาป่วย',
      icon: <Umbrella className="w-6 h-6" />,
      balance: leaveBalance.sickLeave,
      bgColor: 'bg-red-100',
      hoverColor: 'hover:bg-red-200',
    },
    {
      type: 'ลากิจ',
      icon: <Briefcase className="w-6 h-6" />,
      balance: leaveBalance.businessLeave,
      bgColor: 'bg-blue-100',
      hoverColor: 'hover:bg-blue-200',
    },
    {
      type: 'ลาพักร้อน',
      icon: <Calendar className="w-6 h-6" />,
      balance: leaveBalance.annualLeave,
      bgColor: 'bg-green-100',
      hoverColor: 'hover:bg-green-200',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">วันลาคงเหลือ</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {leaveTypes.map((leave) => (
          <button
            key={leave.type}
            onClick={() => onSelectLeaveType?.(leave.type)}
            className={`flex items-center space-x-4 p-3 rounded-lg w-full transition-colors duration-200 
              ${selectedType === leave.type ? 'ring-2 ring-red-500' : ''}
              ${leave.bgColor} ${leave.hoverColor} transform hover:scale-105`}
          >
            <div className="p-2 bg-white bg-opacity-60 rounded-full">
              {leave.icon}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-600">{leave.type}</p>
              <p className="text-lg font-bold text-gray-800">
                {leave.balance} วัน
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Unpaid Leave Option */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <button
          onClick={() => onSelectLeaveType?.('ลาโดยไม่ได้รับค่าจ้าง')}
          className={`w-full flex items-center justify-center space-x-2 p-3 rounded-lg 
            ${selectedType === 'ลาโดยไม่ได้รับค่าจ้าง' ? 'ring-2 ring-red-500' : ''}
            bg-gray-100 hover:bg-gray-200 transition-colors duration-200 transform hover:scale-105`}
        >
          <Ban className="w-5 h-5 text-gray-600" />
          <span className="text-gray-600 font-medium">
            ลาโดยไม่ได้รับค่าจ้าง
          </span>
        </button>
      </div>
    </div>
  );
}
