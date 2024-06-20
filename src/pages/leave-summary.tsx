import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import 'dayjs/locale/th';

const LeaveSummaryPage = () => {
  const router = useRouter();
  const [summaryData, setSummaryData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const data = sessionStorage.getItem('leaveSummary');
    if (data) {
      console.log('Data retrieved from session storage:', data);
      setSummaryData(JSON.parse(data));
    } else {
      console.log('No data found, redirecting to leave request page.');
      router.push('/leave-request');
    }
  }, [router]);

  if (!summaryData) {
    return <div>Loading...</div>;
  }

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      console.log('Submitting data:', summaryData);
      const response = await axios.post('/api/leaveRequest/create', {
        ...summaryData,
        status: 'Pending',
      });
      if (response.status === 201) {
        console.log('Leave request submitted successfully');
        router.push('/leave-confirmation');
      } else {
        console.error('Error:', response.data.error);
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      console.error('Error:', error.response?.data?.error || error.message);
      alert('Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsLoading(false);
    }
  };

  const calculateLeaveDays = (
    startDate: string,
    endDate: string,
    leaveFormat: string,
  ): number => {
    let count = 0;
    let currentDate = new Date(startDate);

    while (currentDate <= new Date(endDate)) {
      if (currentDate.getDay() !== 0) {
        // Exclude Sunday (0)
        count++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (leaveFormat.includes('ครึ่งวัน')) {
      count = 0.5;
    }

    return count;
  };

  const fullDayCount = calculateLeaveDays(
    summaryData.startDate,
    summaryData.endDate,
    summaryData.leaveFormat,
  );

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <div className="mb-1 text-base font-medium dark:text-white">
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: '100%' }}
            ></div>
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-4">แบบฟอร์มขอลางาน</h1>
        <div className="mb-4">
          <p className="mb-2">
            <strong>ประเภทการลา:</strong> {summaryData.leaveType}
          </p>
          <p className="mb-2">
            <strong>รูปแบบการลา:</strong> {summaryData.leaveFormat}
          </p>
          <p className="mb-2">
            <strong>จำนวนวันลา:</strong> {fullDayCount}
          </p>
          <p className="mb-2">
            <strong>วันที่เริ่มต้น:</strong>{' '}
            {dayjs(summaryData.startDate).locale('th').format('D MMM YYYY')}
          </p>
          {fullDayCount > 1 && (
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
            className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? 'กำลังส่ง...' : 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveSummaryPage;
