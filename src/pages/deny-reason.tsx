import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import axios from 'axios';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId } = router.query;

  const [denialReason, setDenialReason] = useState<string>('');
  const [approverId, setApproverId] = useState<string>('');

  useEffect(() => {
    // Initialize LIFF and get the approver's userId
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff.init({ liffId }).then(() => {
        if (liff.isLoggedIn()) {
          liff.getProfile().then((profile) => {
            setApproverId(profile.userId);
          });
        } else {
          liff.login();
        }
      });
    } else {
      console.error('LIFF ID is not defined');
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!denialReason) {
      alert('Please provide a denial reason.');
      return;
    }

    try {
      const response = await axios.post('/api/leaveRequest/deny', {
        requestId,
        approverId,
        denialReason,
      });

      if (response.data.success) {
        alert('Denial reason submitted successfully.');
        liff.closeWindow();
      } else {
        alert(`Error: ${response.data.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <div className="container mx-auto flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">กรอกเหตุผลการปฏิเสธ</h1>
      <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-xs">
        <textarea
          value={denialReason}
          onChange={(e) => setDenialReason(e.target.value)}
          placeholder="กรอกเหตุผลที่นี่..."
          className="w-full p-2 border rounded"
          required
        />
        <button
          type="submit"
          className="w-full p-2 bg-red-500 text-white rounded mt-4"
        >
          ส่งเหตุผล
        </button>
      </form>
    </div>
  );
};

export default DenyReasonPage;
