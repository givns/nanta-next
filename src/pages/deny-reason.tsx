import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId } = router.query; // We only need requestId now
  const [denialReason, setDenialReason] = useState('');
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          setIsLoading(false);
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
        setIsLoading(false);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          lineUserId,
          denialReason,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        liff.closeWindow();
      } else {
        const errorData = await response.json();
        alert(`Failed to submit denial reason: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error submitting denial reason:', error);
      alert('An error occurred. Please try again.');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">ระบุเหตุผลในการไม่อนุมัติ</h1>
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="requestId" value={requestId as string} />
          <input type="hidden" name="lineUserId" value={lineUserId as string} />
          <div>
            <label htmlFor="denialReason">Reason for Denial</label>
            <textarea
              className="w-full p-2 border rounded mb-4"
              rows={4}
              value={denialReason}
              onChange={(e) => setDenialReason(e.target.value)}
              placeholder="กรุณาระบุเหตุผล..."
              required
            />
          </div>
          <button
            type="submit"
            className="w-full p-2 bg-red-500 text-white rounded"
            disabled={!lineUserId}
          >
            ยืนยัน
          </button>
        </form>
      )}
    </div>
  );
};

export default DenyReasonPage;
