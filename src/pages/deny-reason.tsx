import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import liff from '@line/liff';

const DenyReasonPage = () => {
  const router = useRouter();
  const { requestId } = router.query;
  const [denialReason, setDenialReason] = useState('');
  const [approverId, setApproverId] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID || '' });
        if (!liff.isLoggedIn()) {
          liff.login();
        } else {
          const profile = await liff.getProfile();
          setApproverId(profile.userId);
        }
      } catch (error) {
        console.error('Error fetching LINE profile:', error);
      }
    };

    fetchProfile();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      await axios.post('/api/leaveRequest/deny', {
        requestId,
        approverId,
        denialReason,
      });

      alert('Leave request denied');
      liff.closeWindow(); // Close the LIFF window
    } catch (error) {
      console.error('Error submitting denial reason:', error);
      alert('Error denying leave request');
    }
  };

  return (
    <div className="container">
      <h1 className="text-xl font-bold mb-4">Provide Denial Reason</h1>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label
            className="block text-gray-700 text-sm font-bold mb-2"
            htmlFor="denialReason"
          >
            Denial Reason
          </label>
          <textarea
            id="denialReason"
            name="denialReason"
            value={denialReason}
            onChange={(e) => setDenialReason(e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            rows={4}
            required
          />
        </div>
        <button
          type="submit"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Submit
        </button>
      </form>
    </div>
  );
};

export default DenyReasonPage;
