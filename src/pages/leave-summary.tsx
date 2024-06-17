import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';

const LeaveSummaryPage = () => {
  const router = useRouter();
  const [summaryData, setSummaryData] = useState<any>(null);

  useEffect(() => {
    // Retrieve the data from session storage
    const data = sessionStorage.getItem('leaveSummary');
    if (data) {
      setSummaryData(JSON.parse(data));
    } else {
      router.push('/leave-request');
    }
  }, [router]);

  if (!summaryData) {
    return <div>Loading...</div>;
  }

  const handleSubmit = async () => {
    try {
      const response = await axios.post('/api/leaveRequest', {
        ...summaryData,
        status: 'pending', // Ensure status is included
      });
      if (response.status === 201) {
        // Redirect to leave confirmation page
        router.push('/leave-confirmation');
      } else {
        console.error('Error response:', response.data);
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      console.error('Submission error:', error);
      alert('Error: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          สรุปการขอวันลา
        </h5>
        <div className="mb-4">
          <p className="mb-2">
            <strong>ประเภทการลา:</strong> {summaryData.leaveType}
          </p>
          <p className="mb-2">
            <strong>รูปแบบวันลา:</strong>{' '}
            {summaryData.halfDay
              ? `ลาครึ่งวัน (${summaryData.halfDay})`
              : 'ลาเต็มวัน'}
          </p>
          <p className="mb-2">
            <strong>วันที่ลา:</strong>{' '}
            {summaryData.startDate && !summaryData.endDate
              ? dayjs(summaryData.startDate).format('YYYY-MM-DD')
              : `${dayjs(summaryData.startDate).format('YYYY-MM-DD')} - ${dayjs(summaryData.endDate).format('YYYY-MM-DD')}`}
          </p>
          <p className="mb-2">
            <strong>จำนวนวัน:</strong> {summaryData.fullDayCount} วัน
          </p>
          <p className="mb-2">
            <strong>หมายเหตุ:</strong> {summaryData.reason}
          </p>
        </div>
        <div className="flex space-x-4">
          <button
            className="flex-1 p-2 bg-green-500 text-white rounded hover:bg-green-600"
            onClick={handleSubmit}
          >
            ยืนยัน & ส่งคำขอ
          </button>
          <button
            className="flex-1 p-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            onClick={() => router.push('/leave-request')}
          >
            ย้อนกลับ
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveSummaryPage;
