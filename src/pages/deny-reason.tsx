import { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId, approverId } = router.query;
  const [denialReason, setDenialReason] = useState('');

  const handleSubmit = async () => {
    try {
      const response = await axios.post('/api/leaveRequest/deny', {
        requestId,
        approverId,
        denialReason,
      });
      if (response.status === 200) {
        liff.closeWindow();
      } else {
        alert('Failed to submit denial reason.');
      }
    } catch (error) {
      console.error('Error submitting denial reason:', error);
      alert('An error occurred. Please try again.');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">ระบุเหตุผลในการไม่อนุมัติ</h1>
      <textarea
        className="w-full p-2 border rounded mb-4"
        rows={4} // Fixing the type by passing a number instead of a string
        value={denialReason}
        onChange={(e) => setDenialReason(e.target.value)}
        placeholder="กรุณาระบุเหตุผล..."
      />
      <button
        className="w-full p-2 bg-red-500 text-white rounded"
        onClick={handleSubmit}
      >
        ยืนยัน
      </button>
    </div>
  );
};

export default DenyReasonPage;
