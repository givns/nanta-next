import React, { useState, useEffect } from 'react';
import { locationTrackingService } from '../services/locationTrackingService';
import GoogleMapComponent from './GoogleMap';
import { getAddressFromCoordinates } from '../utils/geocoding';

const GeneralCheckForm: React.FC = () => {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleAction = async (
    action: 'checkIn' | 'checkpoint' | 'checkOut',
  ) => {
    setLoading(true);
    setError(null);
    try {
      await fetch(`/api/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, address }),
      });
      alert(`${action} successful!`);
    } catch (error) {
      console.error(`${action} failed:`, error);
      setError(`Failed to ${action}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          Check-In/Out
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
          <div className="button-container flex justify-end space-x-2">
            <button
              onClick={() => handleAction('checkIn')}
              disabled={loading}
              className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            >
              {loading ? 'Checking In...' : 'Check In'}
            </button>
            <button
              onClick={() => handleAction('checkpoint')}
              disabled={loading}
              className="text-white bg-yellow-700 hover:bg-yellow-800 focus:outline-none focus:ring-4 focus:ring-yellow-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2 dark:bg-yellow-600 dark:hover:bg-yellow-700 dark:focus:ring-yellow-800"
            >
              {loading ? 'Adding Checkpoint...' : 'Add Checkpoint'}
            </button>
            <button
              onClick={() => handleAction('checkOut')}
              disabled={loading}
              className="text-white bg-red-700 hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-800"
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

export default GeneralCheckForm;
