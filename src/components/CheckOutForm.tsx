import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { locationTrackingService } from '../services/locationTrackingService';
import GoogleMapComponent from './GoogleMap';
import { getAddressFromCoordinates } from '../utils/geocoding';

const CheckOutForm: React.FC = () => {
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

  const handleCheckOut = async () => {
    setLoading(true);
    setError(null);
    try {
      await locationTrackingService.stopTracking(); // Add lineUserId if needed

      const checkOutData = {
        lineUserId: 'example-id', // Replace with actual user ID
        location,
        address,
      };

      await fetch('/api/checkOut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkOutData),
      });

      alert('Checked out successfully!');
      router.push('/');
    } catch (error) {
      console.error('Check-out failed:', error);
      setError('Failed to check out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          Check-Out
        </h5>
        <div className="space-y-6">
          <div className="mb-3">
            <label
              htmlFor="address"
              className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
            >
              Current Address
            </label>
            <div
              id="address"
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
            >
              {address}
            </div>
          </div>
          {location && (
            <div className="mb-3">
              <GoogleMapComponent center={location} />
            </div>
          )}
          <div className="button-container flex justify-end">
            <button
              onClick={handleCheckOut}
              disabled={loading}
              className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            >
              {loading ? 'Checking Out...' : 'Check Out'}
            </button>
          </div>
          {error && <p className="text-danger text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default CheckOutForm;
