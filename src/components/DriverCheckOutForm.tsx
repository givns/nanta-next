import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';
import { locationTrackingService } from '../services/locationTrackingService';
import Map from './GoogleMap';
import { getAddressFromCoordinates } from '../utils/geocoding';

interface DriverCheckOutFormProps {
  lineUserId: string;
}

const DriverCheckOutForm: React.FC<DriverCheckOutFormProps> = ({
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

  const handleCheckOut = async () => {
    setLoading(true);
    setError(null);
    try {
      await locationTrackingService.stopTracking();

      await fetch('/api/checkOut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId, location, address }),
      });

      setTimeout(() => {
        liff.closeWindow();
        router.push('/');
      }, 2000); // Close after 2 seconds
    } catch (error) {
      console.error('Check-out failed:', error);
      setError('Failed to check out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Driver Check-Out</h2>
      {location && <Map center={location} />}
      <p>Current Address: {address}</p>
      <button onClick={handleCheckOut} disabled={loading}>
        {loading ? 'Checking Out...' : 'Check Out'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default DriverCheckOutForm;
