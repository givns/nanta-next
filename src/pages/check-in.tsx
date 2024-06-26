import { useState } from 'react';
import { useRouter } from 'next/router';
import { locationTrackingService } from '../services/locationTrackingService';
import Map from '../components/Map';
import axios from 'axios';
import { getAddressFromCoordinates } from '../utils/geocoding';

const CheckInPage = () => {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const router = useRouter();
  const [lineUserId] = useState<string>('');

  const handleCheckIn = async () => {
    try {
      const currentLocation =
        await locationTrackingService.getCurrentLocation();
      setLocation({
        lat: currentLocation.latitude,
        lng: currentLocation.longitude,
      });

      // Get address from coordinates (you'll need to implement this)
      const addressFromCoords = await getAddressFromCoordinates(
        currentLocation.latitude,
        currentLocation.longitude,
      );
      setAddress(addressFromCoords);

      // Send check-in data to server
      await axios.post('/api/checkIn', {
        location: currentLocation,
        address: addressFromCoords,
      });

      // Start tracking
      await locationTrackingService.startTracking(lineUserId);

      // Navigate to checkpoint page
      router.push('/checkpoint');
    } catch (error) {
      console.error('Check-in failed:', error);
    }
  };

  return (
    <div>
      <h1>Driver Check-In</h1>
      {location && <Map center={location} />}
      <p>Current Address: {address}</p>
      <button onClick={handleCheckIn}>Check In</button>
    </div>
  );
};

export default CheckInPage;
