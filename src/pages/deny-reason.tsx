import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId, approverId } = router.query; // Get requestId and approverId from query params
  const [denialReason, setDenialReason] = useState('');
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [leaveRequest, setLeaveRequest] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          fetchLeaveRequest(); // Fetch leave request information after getting the user ID
        } else {
          console.log('User not logged in. Redirecting to login...');
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
        setIsLoading(false); // Set loading to false in case of an error
      }
    };
    initializeLiff();
  }, []);

  const fetchLeaveRequest = async () => {
    try {
      const response = await axios.get(`/api/leave-request/${requestId}`);
      setLeaveRequest(response.data);
      console.log('Leave request data:', response.data); // Log the leave request data
      setIsLoading(false); // Set loading to false once data is fetched
    } catch (error) {
      console.error('Error fetching leave request:', error);
      setIsLoading(false); // Set loading to false in case of an error
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Add detailed logging before submission
    console.log('Submitting with values:', {
      requestId,
      approverId,
      lineUserId,
      denialReason,
      leaveRequest,
    });

    if (!denialReason || !requestId || !lineUserId || !approverId) {
      console.log('Missing required information:', {
        requestId,
        approverId,
        lineUserId,
        denialReason,
      });
      alert('Missing required information.');
      return;
    }

    try {
      const response = await axios.post('/api/leaveRequest/deny', {
        action: 'deny',
        requestId,
        approverId,
        lineUserId,
        denialReason,
        leaveRequest, // Include leave request information
      });

      if (response.status === 200) {
        alert('Leave request denied successfully.');
        liff.closeWindow(); // Close the LIFF window
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
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="requestId" value={requestId as string} />
          <input type="hidden" name="approverId" value={approverId as string} />
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
            disabled={!lineUserId || isLoading}
          >
            ยืนยัน
          </button>
        </form>
      )}
    </div>
  );
};

export default DenyReasonPage;
