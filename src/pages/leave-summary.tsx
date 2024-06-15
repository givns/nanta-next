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
    <div className="container mx-auto p-4 bg-white rounded shadow-lg max-w-md">
      <div className="flex flex-col">
        <div className="header bg-[#F0F0F0] p-4 rounded-t">
          <h1 className="text-2xl font-bold">ตรวจสอบข้อมูล</h1>
        </div>
        <div className="body p-4">
          <h2 className="text-xl mb-4">สรุปการขอวันลา</h2>
          <div className="bg-white p-4 rounded shadow">
            <p className="mb-2">
              <strong>ประเภทการลา:</strong> {summaryData.leaveType}
            </p>
            <p className="mb-2">
              <strong>รูปแบบวันลา:</strong> {summaryData.leaveFormat}
            </p>
            <p className="mb-2">
              <strong>วันที่ลา:</strong>{' '}
              {dayjs(summaryData.startDate).format('YYYY-MM-DD')} -{' '}
              {dayjs(summaryData.endDate).format('YYYY-MM-DD')}
            </p>
            <p className="mb-2">
              <strong>จำนวนวัน:</strong>{' '}
              {dayjs(summaryData.endDate).diff(
                dayjs(summaryData.startDate),
                'day',
              ) + 1}{' '}
              วัน
            </p>
            <p className="mb-2">
              <strong>หมายเหตุ:</strong> {summaryData.reason}
            </p>
          </div>
        </div>
        <div className="footer p-4 bg-[#F0F0F0] rounded-b">
          <button
            className="w-full p-2 bg-[#00FF7F] text-white rounded"
            onClick={handleSubmit}
          >
            ยืนยัน & ส่งคำขอ
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveSummaryPage;
