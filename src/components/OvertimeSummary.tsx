import React from 'react';
import { format } from 'date-fns';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>สรุปคำขอทำงานล่วงเวลา</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <strong>วันที่:</strong> {format(new Date(data.date), 'dd/MM/yyyy')}
        </div>
        <div>
          <strong>เวลา:</strong> {data.startTime} - {data.endTime}
        </div>
        <div>
          <strong>เหตุผล:</strong> {data.reason}
        </div>
        <div>
          <strong>รายชื่อพนักงาน:</strong>
          <ul className="list-disc pl-5 mt-2">
            {data.employees.map((employee, index) => (
              <li key={index}>
                {employee.name} - {employee.isDayOff ? 'วันหยุด' : 'วันทำงาน'}{' '}
                (ระยะเวลา: {employee.duration} ชั่วโมง)
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button onClick={onCancel} variant="outline">
          แก้ไข
        </Button>
        <Button onClick={onConfirm}>ยืนยันและส่งคำขอ</Button>
      </CardFooter>
    </Card>
  );
};

export default OvertimeSummary;
