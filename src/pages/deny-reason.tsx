import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [denierEmployeeId, setDenierEmployeeId] = useState<string | null>(null);
  const [denialReason, setDenialReason] = useState('');
  const [, setLineUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);

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

  useEffect(() => {
    console.log('Router query:', router.query);
  }, [router.query]);

  useEffect(() => {
    if (router.isReady) {
      setRequestId(router.query.requestId as string);
      setDenierEmployeeId(router.query.denierEmployeeId as string);
    }
  }, [router.isReady, router.query]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    console.log('Submitting form with:', {
      requestId,
      denierEmployeeId,
      denialReason,
    });

    if (!denialReason || !requestId || !denierEmployeeId) {
      console.error('Missing required information:', {
        denialReason,
        requestId,
        denierEmployeeId,
      });
      setError(
        'Missing required information. Please make sure all fields are filled.',
      );
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/leaveRequest/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          denierEmployeeId,
          denialReason,
        }),
      });

      if (response.ok) {
        setError('เหตุผลในการปฏิเสธได้ถูกส่งเรียบร้อยแล้ว');
        setTimeout(() => {
          liff.closeWindow();
        }, 3000);
      } else {
        const errorData = await response.json();
        console.error('Error response:', errorData);
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
    <form onSubmit={handleSubmit}>
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      {denierEmployeeId && (
        <input type="hidden" name="denierEmployeeId" value={denierEmployeeId} />
      )}
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
        disabled={loading || !requestId || !denierEmployeeId}
      >
        {loading ? 'กำลังส่งคำขอ...' : 'ยืนยัน'}
      </button>
    </form>
  );
};

export default DenyReasonPage;
