import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';
import { locationTrackingService } from '../services/locationTrackingService';
import Map from './Map';
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
    <div>
      <h2>Driver Check-In</h2>
      {location && <Map center={location} />}
      <p>Current Address: {address}</p>
      <button onClick={handleCheckIn} disabled={loading}>
        {loading ? 'Checking In...' : 'Check In'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default DriverCheckInForm;
