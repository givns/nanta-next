import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { locationTrackingService } from '../services/locationTrackingService';
import Map from '../components/Map';
import { getAddressFromCoordinates } from '../utils/geocoding';

const CheckpointPage = () => {
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [newCheckpoint, setNewCheckpoint] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    // Check if user is checked in
    checkUserStatus();
  }, []);

  const checkUserStatus = async () => {
    const response = await axios.get('/api/userStatus');
    if (!response.data.isCheckedIn) {
      router.push('/check-in');
    }
  };

  const handleAddCheckpoint = async () => {
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

      await axios.post('/api/addCheckpoint', {
        checkpoint: newCheckpoint,
        location: currentLocation,
        address: addressFromCoords,
      });

      setCheckpoints([...checkpoints, newCheckpoint]);
      setNewCheckpoint('');
    } catch (error) {
      console.error('Failed to add checkpoint:', error);
    }
  };

  const handleProceedToCheckout = () => {
    router.push('/check-out');
  };

  return (
    <div>
      <h1>Checkpoints</h1>
      {location && <Map center={location} />}
      <p>Current Address: {address}</p>
      <ul>
        {checkpoints.map((checkpoint, index) => (
          <li key={index}>{checkpoint}</li>
        ))}
      </ul>
      <input
        type="text"
        value={newCheckpoint}
        onChange={(e) => setNewCheckpoint(e.target.value)}
        placeholder="Enter new checkpoint"
      />
      <button onClick={handleAddCheckpoint}>Add Checkpoint</button>
      <button onClick={handleProceedToCheckout}>Proceed to Check-Out</button>
    </div>
  );
};

export default CheckpointPage;
