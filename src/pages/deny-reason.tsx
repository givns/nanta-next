import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId, approverId } = router.query; // Get requestId from query params
  const [denialReason, setDenialReason] = useState('');
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      console.log('Initializing LIFF...');
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        console.log('LIFF initialized.');
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          console.log('User logged in. User ID:', profile.userId); // Log the user ID
        } else {
          console.log('User not logged in. Redirecting to login...');
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };
    initializeLiff();
  }, []);

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
      <form onSubmit={handleSubmit}>
        <input type="hidden" name="requestId" value={requestId as string} />
        <input type="hidden" name="lineUserId" value={lineUserId as string} />
        <div>
          <label htmlFor="denialReason">Reason for Denial</label>
          <textarea
            className="w-full p-2 border rounded mb-4"
            rows={4} // Fixing the type by passing a number instead of a string
            value={denialReason}
            onChange={(e) => setDenialReason(e.target.value)}
            placeholder="กรุณาระบุเหตุผล..."
          />
        </div>
        <button
          className="w-full p-2 bg-red-500 text-white rounded"
          onClick={handleSubmit}
        >
          ยืนยัน
        </button>
      </form>
    </div>
  );
};

export default DenyReasonPage;
