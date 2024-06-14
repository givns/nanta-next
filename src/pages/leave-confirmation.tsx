import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import liff from '@line/liff';
const LeaveConfirmationPage = () => {
  const router = useRouter();
  const [leaveData, setLeaveData] = useState<any>(null);

  useEffect(() => {
    if (router.query.data) {
      setLeaveData(JSON.parse(router.query.data as string));
    }
  }, [router.query]);

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-bold mb-4">ส่งคำขอเสร็จสิ้น</h1>
      <p>ส่งคำขอวันลาของคุณแล้ว</p>
      {leaveData && (
        <div>
          <p>ประเภทการลา: {leaveData.leaveType}</p>
          <p>รูปแบบวันลา: {leaveData.leaveForm}</p>
          <p>
            วันที่ลา: {leaveData.startDate} ถึง {leaveData.endDate}
          </p>
          <p>จำนวนวัน: {leaveData.days}</p>
          <p>หมายเหตุ: {leaveData.reason}</p>
        </div>
      )}
      <button
        className="w-full p-2 bg-blue-500 text-white rounded"
        onClick={() => liff.closeWindow()}
      >
        ปิดหน้าต่างนี้
      </button>
    </div>
  );
};

export default LeaveConfirmationPage;
