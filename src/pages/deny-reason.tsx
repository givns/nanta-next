import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId, approverId } = router.query;
  const [denialReason, setDenialReason] = useState('');
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitStatus, setSubmitStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');

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

    if (!denialReason || !requestId || !lineUserId || !approverId) {
      setSubmitStatus('error');
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
        setSubmitStatus('success');
        // Close the LIFF window after a short delay
        setTimeout(() => {
          liff.closeWindow();
        }, 3000);
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('Error submitting denial reason:', error);
      setSubmitStatus('error');
    }
  };

  if (isLoading) {
    return <p>กำลังโหลด...</p>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">ระบุเหตุผลในการไม่อนุมัติ</h1>
      {submitStatus === 'success' ? (
        <div
          className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative"
          role="alert"
        >
          <strong className="font-bold">สำเร็จ!</strong>
          <span className="block sm:inline">
            {' '}
            เหตุผลในการปฏิเสธได้ถูกส่งเรียบร้อยแล้ว
          </span>
          <p>หน้าต่างนี้จะปิดโดยอัตโนมัติใน 3 วินาที</p>
        </div>
      ) : (
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
            disabled={
              !lineUserId || submitStatus === 'idle' || submitStatus === 'error'
            }
          >
            ยืนยัน
          </button>
        </form>
      )}
      {submitStatus === 'error' && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-4"
          role="alert"
        >
          <strong className="font-bold">ข้อผิดพลาด!</strong>
          <span className="block sm:inline">
            {' '}
            เกิดข้อผิดพลาดในการส่งเหตุผล โปรดลองอีกครั้ง
          </span>
        </div>
      )}
    </div>
  );
};

export default DenyReasonPage;
