import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import dayjs from 'dayjs';
import 'dayjs/locale/th';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(isSameOrBefore);
dayjs.extend(customParseFormat);

const calculateFullDayCount = (startDate: Date, endDate: Date): number => {
  let count = 0;
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0) {
      // 0 corresponds to Sunday
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return count;
};

const LeaveSummary: React.FC = () => {
  const router = useRouter();
  const [leaveData, setLeaveData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const data = sessionStorage.getItem('leaveSummary');
    if (data) {
      const parsedData = JSON.parse(data);
      const fullDayCount =
        parsedData.leaveFormat === 'ลาครึ่งวัน'
          ? 0.5
          : calculateFullDayCount(
              new Date(parsedData.startDate),
              new Date(parsedData.endDate),
            );
      parsedData.fullDayCount = fullDayCount;
      setLeaveData(parsedData);
    } else {
      router.push('/leave-request-form');
    }
  }, [router]);

  const handleSubmit = async () => {
    if (!leaveData) return;
    setLoading(true);
    try {
      const response = await axios.post('/api/leaveRequest/create', leaveData);
      if (response.status === 201) {
        alert('Leave request submitted successfully');
        router.push('/leave-confirmation');
      } else {
        alert('Error submitting leave request');
      }
    } catch (error) {
      console.error('Error submitting leave request:', error);
      alert('Error submitting leave request');
    } finally {
      setLoading(false);
    }
  };

  if (!leaveData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          สรุปการขอลางาน
        </h5>
        <div className="space-y-4">
          <div>
            <strong>ประเภทการลา:</strong> {leaveData.leaveType}
          </div>
          <div>
            <strong>ลักษณะการลา:</strong> {leaveData.leaveFormat}
          </div>
          <div>
            <strong>เหตุผล:</strong> {leaveData.reason}
          </div>
          <div>
            <strong>วันที่เริ่มต้น:</strong>{' '}
            {dayjs(leaveData.startDate).format('DD MMM YYYY')}
          </div>
          {leaveData.leaveFormat === 'ลาเต็มวัน' && (
            <div>
              <strong>วันที่สิ้นสุด:</strong>{' '}
              {dayjs(leaveData.endDate).format('DD MMM YYYY')}
            </div>
          )}
          <div>
            <strong>จำนวนวันลา:</strong> {leaveData.fullDayCount} วัน
          </div>
        </div>
        <div className="button-container flex justify-between mt-4">
          <button
            type="button"
            className="py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
            onClick={() => router.push('/leave-request-form')}
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'กำลังส่ง...' : 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveSummary;
