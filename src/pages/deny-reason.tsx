import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import liff from '@line/liff';

const DenyReason = () => {
  const [denialReason, setDenialReason] = useState('');
  const [requestId, setRequestId] = useState('');
  const [approverId, setApproverId] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Get requestId and approverId from query parameters
    const { requestId, approverId } = router.query;
    if (requestId) setRequestId(requestId as string);
    if (approverId) setApproverId(approverId as string);
  }, [router.query]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await axios.post('/api/leaveRequest/deny', {
        requestId,
        approverId,
        denialReason,
      });
      if (response.data.success) {
        liff.closeWindow();
      } else {
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      console.error('Error submitting denial reason:', error);
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="container mx-auto flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">เหตุผลการปฏิเสธ</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-4">
          <textarea
            value={denialReason}
            onChange={(e) => setDenialReason(e.target.value)}
            placeholder="โปรดระบุเหตุผล"
            className="w-full p-2 border rounded"
            rows={4}
            required
          />
        </div>
        <button
          type="submit"
          className="w-full p-2 bg-red-500 text-white rounded"
        >
          ส่งเหตุผลการปฏิเสธ
        </button>
      </form>
    </div>
  );
};

export default DenyReason;
