import { useState } from 'react';
import { useRouter } from 'next/router';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId, approverId } = router.query; // Get requestId and approverId from query params
  const [denialReason, setDenialReason] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!denialReason || !requestId || !approverId) {
      alert('Missing required information.');
      return;
    }

    try {
      const response = await fetch('/api/leaveRequest/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deny',
          requestId,
          approverId,
          denialReason,
        }),
      });

      if (response.status === 200) {
        alert('Leave request denied successfully.');
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
        >
          ยืนยัน
        </button>
      </form>
    </div>
  );
};

export default DenyReasonPage;
