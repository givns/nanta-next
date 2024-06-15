import { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId } = router.query;
  const [denialReason, setDenialReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const approverId = 'LINE_USER_ID'; // Replace this with actual approver ID logic
    if (!requestId || !denialReason || !approverId) {
      console.error('Missing required fields:', {
        requestId,
        approverId,
        denialReason,
      });
      return;
    }
    try {
      await axios.post('/api/leaveRequest/deny', {
        requestId,
        approverId,
        denialReason,
      });
      alert('Request denied successfully.');
      router.push('/confirmation'); // Redirect to confirmation page
    } catch (error) {
      console.error('Error denying request:', error);
      alert('Failed to deny request.');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Reason for Denial:
        <input
          type="text"
          value={denialReason}
          onChange={(e) => setDenialReason(e.target.value)}
        />
      </label>
      <button type="submit">Submit</button>
    </form>
  );
};

export default DenyReasonPage;
