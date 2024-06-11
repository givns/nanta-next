import React, { useState, useEffect } from 'react';
import liff from '@line/liff';

const Checkin: React.FC = () => {
  const [userId, setUserId] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        const response = await fetch('/api/liff-id/checkin');
        const data = await response.json();
        const liffId = data.liffId;

        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
        } else {
          const profile = await liff.getProfile();
          setUserId(profile.userId);
        }
      } catch (error) {
        console.error('LIFF initialization failed', error);
      }
    };

    initializeLiff();
  }, []);

  const handleCheckin = async () => {
    if (!location) {
      setMessage('Please provide your location.');
      return;
    }

    try {
      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, location }),
      });

      if (response.ok) {
        setMessage('Check-in successful!');
      } else {
        setMessage('Check-in failed.');
      }
    } catch (error) {
      console.error('Error during check-in:', error);
      setMessage('Error occurred during check-in.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="container bg-white p-6 rounded-lg shadow-lg w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">Check In</h1>
        <div className="mb-4">
          <label
            htmlFor="location"
            className="block text-gray-700 font-bold mb-2"
          >
            Location
          </label>
          <input
            type="text"
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
        <button
          onClick={handleCheckin}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Check In
        </button>
        {message && <p className="mt-4 text-red-500">{message}</p>}
      </div>
    </div>
  );
};

export default Checkin;
