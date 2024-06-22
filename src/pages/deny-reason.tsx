// pages/deny-reason.js
import { useRouter } from 'next/router';
import { useState } from 'react';
import axios from 'axios';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId } = router.query;
  const [denialReason, setDenialReason] = useState('');

  const handleDeny = async () => {
    try {
      await axios.post('/api/leaveRequest/deny', {
        requestId,
        denialReason,
      });
      alert('Denial reason submitted successfully');
      router.push('/');
    } catch (error) {
      console.error('Error submitting denial reason:', error);
      alert('Error submitting denial reason');
    }
  };

  return (
    <div>
      <h1>Provide Denial Reason</h1>
      <textarea
        value={denialReason}
        onChange={(e) => setDenialReason(e.target.value)}
        placeholder="Enter denial reason"
      />
      <button onClick={handleDeny}>Submit Denial Reason</button>
    </div>
  );
};

export default DenyReasonPage;
