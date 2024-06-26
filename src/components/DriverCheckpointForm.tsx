import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { locationTrackingService } from '../services/locationTrackingService';
import GoogleMapComponent from './GoogleMap';
import { getAddressFromCoordinates } from '../utils/geocoding';
const DriverCheckpointForm: React.FC = () => {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [checkpointName, setCheckpointName] = useState<string>('');
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

  const handleAddCheckpoint = async () => {
    setLoading(true);
    setError(null);
    try {
      await fetch('/api/addCheckpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, address, checkpointName }),
      });
      setCheckpointName('');
      getCurrentLocation(); // Refresh location after adding checkpoint
    } catch (error) {
      console.error('Failed to add checkpoint:', error);
      setError('Failed to add checkpoint. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToCheckout = () => {
    router.push('/driver-checkout');
  };

  return (
    <div>
      <h2>Driver Checkpoint</h2>
      {location && <GoogleMapComponent center={location} />}
      <p>Current Address: {address}</p>
      <input
        type="text"
        value={checkpointName}
        onChange={(e) => setCheckpointName(e.target.value)}
        placeholder="Enter checkpoint name"
      />
      <button onClick={handleAddCheckpoint} disabled={loading}>
        {loading ? 'Adding...' : 'Add Checkpoint'}
      </button>
      <button onClick={handleProceedToCheckout}>Proceed to Check-Out</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default DriverCheckpointForm;
