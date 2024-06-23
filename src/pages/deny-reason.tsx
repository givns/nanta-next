import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId, approverId } = router.query;
  const [denialReason, setDenialReason] = useState('');
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError('Failed to initialize LIFF. Please try again.');
      }
    };
    initializeLiff();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (!denialReason || !requestId || !lineUserId || !approverId) {
      setError('Missing required information.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/leaveRequest/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          approverId,
          lineUserId,
          denialReason,
        }),
      });

      if (response.ok) {
        // Show success message
        setError('เหตุผลในการปฏิเสธได้ถูกส่งเรียบร้อยแล้ว');
        // Close the LIFF window after a short delay
        setTimeout(() => {
          liff.closeWindow();
        }, 3000);
      } else {
        const errorData = await response.json();
        setError(`Failed to submit denial reason: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error submitting denial reason:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <p>กำลังโหลด...</p>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">ระบุเหตุผลในการไม่อนุมัติ</h1>
      <form onSubmit={handleSubmit}>
        <input type="hidden" name="requestId" value={requestId as string} />
        <input type="hidden" name="approverId" value={approverId as string} />
        <input type="hidden" name="lineUserId" value={lineUserId as string} />
        <div>
          <label
            htmlFor="denialReason"
            className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
          >
            เหตุผลในการปฏิเสธ
          </label>
          <textarea
            id="denialReason"
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
          disabled={loading}
        >
          {loading ? 'กำลังส่งคำขอ...' : 'ยืนยัน'}
        </button>
      </form>
      {error && (
        <div
          className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
};

export default DenyReasonPage;
