import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { locationTrackingService } from '../services/locationTrackingService';
import Map from './GoogleMap';
import { getAddressFromCoordinates } from '../utils/geocoding';

interface DriverCheckInFormProps {
  lineUserId: string;
}

const DriverCheckInForm: React.FC<DriverCheckInFormProps> = ({
  lineUserId,
}) => {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      const currentLocation =
        await locationTrackingService.getCurrentLocation();
      setLocation({
        lat: currentLocation.latitude,
        lng: currentLocation.longitude,
      });
      const addressFromCoords = await getAddressFromCoordinates(
        currentLocation.latitude,
        currentLocation.longitude,
      );
      setAddress(addressFromCoords);
    } catch (error) {
      console.error('Error getting current location:', error);
      setError('Unable to get current location. Please try again.');
    }
  };

  const handleCheckIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await locationTrackingService.startTracking(lineUserId);

      // Send check-in data to server
      await fetch('/api/checkIn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId, location, address }),
      });

      router.push('/driver-checkpoint');
    } catch (error) {
      console.error('Check-in failed:', error);
      setError('Failed to check in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          Driver Check-In
        </h5>
        <div className="space-y-6">
          <div className="mb-3">
            <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
              Current Address
            </label>
            <div className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:text-white">
              {address}
            </div>
          </div>
          {location && (
            <div className="mb-3">
              <Map center={location} />
            </div>
          )}
          <div className="button-container flex justify-end">
            <button
              onClick={handleCheckIn}
              disabled={loading || !location}
              className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            >
              {loading ? 'Checking In...' : 'Check In'}
            </button>
          </div>
          {error && <p className="text-danger text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default DriverCheckInForm;
