import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import liff from '@line/liff';

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
      const response = await axios.post('/api/leaveRequest', summaryData);
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
    <div className="container mx-auto">
      <h1 className="text-2xl font-bold mb-4">ตรวจสอบข้อมูล</h1>
      <h2 className="text-xl mb-4">สรุปการขอวันลา</h2>
      <div className="bg-white p-4 rounded shadow">
        <p>
          <strong>ประเภทการลา:</strong> {summaryData.leaveType}
        </p>
        <p>
          <strong>รูปแบบวันลา:</strong> {summaryData.leaveFormat}
        </p>
        <p>
          <strong>วันที่ลา:</strong>{' '}
          {dayjs(summaryData.startDate).format('YYYY-MM-DD')} -{' '}
          {dayjs(summaryData.endDate).format('YYYY-MM-DD')}
        </p>
        <p>
          <strong>จำนวนวัน:</strong>{' '}
          {dayjs(summaryData.endDate).diff(
            dayjs(summaryData.startDate),
            'day',
          ) + 1}{' '}
          วัน
        </p>
        <p>
          <strong>หมายเหตุ:</strong> {summaryData.reason}
        </p>
      </div>
      <button
        className="w-full p-2 bg-blue-500 text-white rounded mt-4"
        onClick={handleSubmit}
      >
        ยืนยัน & ส่งคำขอ
      </button>
    </div>
  );
};

export default LeaveSummaryPage;
