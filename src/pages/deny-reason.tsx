import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId } = router.query; // Get requestId from query params
  const [denialReason, setDenialReason] = useState('');
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };
    initializeLiff();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!denialReason || !requestId || !lineUserId) {
      alert('Missing required information.');
      return;
    }

    try {
      const response = await fetch('/api/leaveRequest/deny', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deny', // Include the deny action
          requestId,
          lineUserId,
          denialReason,
        }),
      });

      if (response.ok) {
        alert('Leave request denied successfully.');
        liff.closeWindow(); // Close the LIFF window
      } else {
        alert('Error denying leave request.');
      }
    } catch (error) {
      console.error('Error denying leave request:', error);
      alert('Error denying leave request.');
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
        <button type="submit" disabled={!lineUserId}>
          Submit
        </button>
      </form>
    </div>
  );
};

export default DenyReasonPage;
