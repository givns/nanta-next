import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const LeaveSummaryPage = () => {
  const router = useRouter();
  const [summaryData, setSummaryData] = useState<any>(null);

  useEffect(() => {
    // Retrieve the data from the query parameters
    if (router.query.data) {
      const parsedData = JSON.parse(router.query.data as string);
      setSummaryData(parsedData);
    }
  }, [router.query.data]);

  if (!summaryData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-bold mb-4">ตรวจสอบข้อมูล</h1>
      <h2 className="text-xl mb-4">สรุปการขอวันลา</h2>
      <div className="bg-white p-4 rounded shadow">
        <p>
          <strong>ประเภทการลา:</strong> {summaryData.leaveType}
        </p>
        <p>
          <strong>รูปแบบวันลา:</strong> {summaryData.leaveForm}
        </p>
        <p>
          <strong>วันที่ลา:</strong> {summaryData.startDate}
        </p>
        <p>
          <strong>จำนวนวัน:</strong> {summaryData.days} วัน
        </p>
        <p>
          <strong>หมายเหตุ:</strong> {summaryData.reason}
        </p>
      </div>
      <button
        className="w-full p-2 bg-blue-500 text-white rounded mt-4"
        onClick={() => {
          // Handle the submission of the leave request here
          alert('การส่งคำขอลาเสร็จสมบูรณ์');
        }}
      >
        ยืนยัน & ส่งคำขอ
      </button>
    </div>
  );
};

export default LeaveSummaryPage;
