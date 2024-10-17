import React from 'react';
import { format } from 'date-fns';

interface OvertimeSummaryProps {
  data: {
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
    employees: Array<{
      employeeId: string;
      name: string;
      isDayOff: boolean;
      duration: number;
    }>;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

const OvertimeSummary: React.FC<OvertimeSummaryProps> = ({
  data,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="bg-white rounded-box p-4 mb-4">
      <h2 className="text-2xl font-bold mb-6 text-center">
        สรุปคำขอทำงานล่วงเวลา
      </h2>
      <div className="space-y-4">
        <p>
          <strong>วันที่:</strong> {format(new Date(data.date), 'dd/MM/yyyy')}
        </p>
        <p>
          <strong>เวลา:</strong> {data.startTime} - {data.endTime}
        </p>
        <p>
          <strong>เหตุผล:</strong> {data.reason}
        </p>
        <h3 className="text-lg font-semibold">รายชื่อพนักงาน:</h3>
        <ul className="list-disc pl-5">
          {data.employees.map((employee, index) => (
            <li key={index}>
              {employee.name} - {employee.isDayOff ? 'วันหยุด' : 'วันทำงาน'}{' '}
              (ระยะเวลา: {employee.duration} ชั่วโมง)
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-6 flex justify-between">
        <button
          onClick={onCancel}
          className="py-2 px-4 border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          แก้ไข
        </button>
        <button
          onClick={onConfirm}
          className="py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          ยืนยันและส่งคำขอ
        </button>
      </div>
    </div>
  );
};
