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
    <div>
      <h2>Check-In/Out</h2>
      {location && <GoogleMapComponent center={location} />}
      <p>Current Address: {address}</p>
      <button onClick={() => handleAction('checkIn')} disabled={loading}>
        Check In
      </button>
      <button onClick={() => handleAction('checkpoint')} disabled={loading}>
        Add Checkpoint
      </button>
      <button onClick={() => handleAction('checkOut')} disabled={loading}>
        Check Out
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default GeneralCheckForm;
