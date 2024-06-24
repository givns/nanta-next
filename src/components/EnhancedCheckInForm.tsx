// components/EnhancedCheckInForm.tsx

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import liff from '@line/liff';
import { useZxing } from 'react-zxing';

const EnhancedCheckInForm: React.FC = () => {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [location, setLocation] = useState<string>('');
  const [method, setMethod] = useState<'GPS' | 'QR' | 'MANUAL'>('GPS');
  const [type, setType] = useState<'IN' | 'OUT' | 'CHECKPOINT'>('IN');
  const [checkpointName, setCheckpointName] = useState<string>('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const { ref } = useZxing({
    onDecodeResult(result) {
      setLocation(result.getText());
      setShowQRScanner(false);
      setMethod('QR');
    },
  });

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };
    initializeLiff();
  }, []);

  useEffect(() => {
    if (method === 'GPS') {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
        },
        (error) => {
          console.error('Error getting location:', error);
          setError(
            'Unable to get GPS location. Please try again or use manual check-in.',
          );
        },
      );
    }
  }, [method]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/checkIn', {
        userId: lineUserId,
        latitude,
        longitude,
        location,
        method,
        type,
        checkpointName: type === 'CHECKPOINT' ? checkpointName : undefined,
      });

      if (response.data.success) {
        alert('Check-in successful!');
        router.push('/check-in-confirmation');
      } else {
        setError('Failed to check in. Please try again.');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!lineUserId) {
    return <div>Loading...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="type"
          className="block text-sm font-medium text-gray-700"
        >
          Check-in Type
        </label>
        <select
          id="type"
          value={type}
          onChange={(e) =>
            setType(e.target.value as 'IN' | 'OUT' | 'CHECKPOINT')
          }
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        >
          <option value="IN">Check In</option>
          <option value="OUT">Check Out</option>
          <option value="CHECKPOINT">Checkpoint</option>
        </select>
      </div>
      {type === 'CHECKPOINT' && (
        <div>
          <label
            htmlFor="checkpointName"
            className="block text-sm font-medium text-gray-700"
          >
            Checkpoint Name
          </label>
          <input
            type="text"
            id="checkpointName"
            value={checkpointName}
            onChange={(e) => setCheckpointName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>
      )}
      <div>
        <label
          htmlFor="method"
          className="block text-sm font-medium text-gray-700"
        >
          Check-in Method
        </label>
        <select
          id="method"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'GPS' | 'QR' | 'MANUAL')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        >
          <option value="GPS">GPS</option>
          <option value="QR">QR Code</option>
          <option value="MANUAL">Manual</option>
        </select>
      </div>
      {method === 'MANUAL' && (
        <div>
          <label
            htmlFor="location"
            className="block text-sm font-medium text-gray-700"
          >
            Location
          </label>
          <input
            type="text"
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>
      )}
      {method === 'QR' && (
        <div>
          <button
            type="button"
            onClick={() => setShowQRScanner(!showQRScanner)}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {showQRScanner ? 'Hide QR Scanner' : 'Scan QR Code'}
          </button>
          {showQRScanner && (
            <div>
              <video ref={ref} />
            </div>
          )}
        </div>
      )}
      {method === 'GPS' && (
        <div>
          <p>Latitude: {latitude}</p>
          <p>Longitude: {longitude}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        {loading ? 'Processing...' : 'Submit'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </form>
  );
};

export default EnhancedCheckInForm;
