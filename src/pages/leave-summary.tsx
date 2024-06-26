import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import dayjs from 'dayjs';
import 'dayjs/locale/th';
import { calculateFullDayCount } from '../lib/holidayUtils';

interface SummaryData {
  leaveType: string;
  leaveFormat: string;
  startDate: string;
  endDate?: string;
  reason: string;
  lineUserId: string | null;
  resubmitted: boolean;
}

const LeaveSummaryPage: React.FC = () => {
  const router = useRouter();
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaveDays, setLeaveDays] = useState<number | null>(null);

  useEffect(() => {
    const data = sessionStorage.getItem('leaveSummary');
    if (data) {
      const parsedData = JSON.parse(data) as SummaryData;
      setSummaryData(parsedData);
      calculateFullDayCount(
        parsedData.startDate,
        parsedData.endDate || parsedData.startDate,
        parsedData.leaveFormat,
      ).then(setLeaveDays);
    } else {
      console.log('No data found, redirecting to leave request page.');
      router.push('/leave-request');
    }
  }, [router]);

  const handleSubmit = async () => {
    if (!summaryData) return;

    setLoading(true);
    try {
      const leaveData = {
        ...summaryData,
        fullDayCount: leaveDays,
        startDate: new Date(summaryData.startDate).toISOString(),
        endDate:
          summaryData.leaveFormat === 'ลาครึ่งวัน'
            ? new Date(summaryData.startDate).toISOString()
            : new Date(summaryData.endDate!).toISOString(),
      };

      console.log('Submitting leaveData:', leaveData);
      const response = await axios.post('/api/leaveRequest/create', leaveData);

      if (response.status === 201) {
        console.log('Leave request submitted successfully');
        sessionStorage.removeItem('leaveSummary');
        router.push('/leave-confirmation');
      } else {
        throw new Error(response.data.error || 'Unknown error occurred');
      }
    } catch (error: any) {
      console.error('Error:', error.message);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!summaryData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h1 className="text-2xl font-bold mb-4">รายละเอียดการลา</h1>
        <div className="mb-4">
          <p className="mb-2">
            <strong>ประเภทการลา:</strong> {summaryData.leaveType}
          </p>
          <p className="mb-2">
            <strong>รูปแบบการลา:</strong> {summaryData.leaveFormat}
          </p>
          <p className="mb-2">
            <strong>จำนวนวันลา:</strong>{' '}
            {leaveDays !== null ? leaveDays : 'กำลังคำนวณ...'}
          </p>
          <p className="mb-2">
            <strong>วันที่เริ่มต้น:</strong>{' '}
            {dayjs(summaryData.startDate).locale('th').format('D MMM YYYY')}
          </p>
          {summaryData.leaveFormat === 'ลาเต็มวัน' && summaryData.endDate && (
            <p className="mb-2">
              <strong>วันที่สิ้นสุด:</strong>{' '}
              {dayjs(summaryData.endDate).locale('th').format('D MMM YYYY')}
            </p>
          )}
          <p className="mb-2">
            <strong>เหตุผล:</strong> {summaryData.reason}
          </p>
        </div>
        <div className="button-container flex justify-between mt-4">
          <button
            type="button"
            className="py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
            onClick={() => router.push('/leave-request')}
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5"
            onClick={handleSubmit}
            disabled={loading || leaveDays === null}
          >
            {loading ? 'กำลังส่งคำขอ...' : 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveSummaryPage;
