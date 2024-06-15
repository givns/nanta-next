import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId, approverId } = router.query;
  const [reason, setReason] = useState('');

  useEffect(() => {
    // Initialize LIFF and get the user's profile
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff.init({ liffId }).then(() => {
        if (!liff.isLoggedIn()) {
          liff.login();
        }
      });
    } else {
      console.error('LIFF ID is not defined');
    }
  }, []);

  const handleSubmit = async () => {
    try {
      await axios.post('/api/leaveRequest/deny', {
        requestId,
        denialReason: reason,
        approverId, // Send the approverId along with the denial reason
      });
      router.push('/leave-confirmation');
    } catch (error) {
      console.error('Error submitting denial reason:', error);
      alert('Error submitting denial reason');
    }
  };

  return (
    <div className="container mx-auto flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">ระบุเหตุผลในการไม่อนุมัติ</h1>
      <textarea
        className="w-full p-2 border rounded"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={5}
        placeholder="กรุณาระบุเหตุผล"
      ></textarea>
      <button
        className="w-full p-2 bg-blue-500 text-white rounded mt-4"
        onClick={handleSubmit}
      >
        ยืนยัน
      </button>
    </div>
  );
};

export default DenyReasonPage;
