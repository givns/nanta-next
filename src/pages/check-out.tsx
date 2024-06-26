import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { locationTrackingService } from '../services/locationTrackingService';
import Map from '../components/Map';
import { getAddressFromCoordinates } from '../utils/geocoding';
import liff from '@line/liff';

const CheckOutPage = () => {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    checkUserStatus();
  }, []);

  const checkUserStatus = async () => {
    const response = await axios.get('/api/userStatus');
    if (!response.data.isCheckedIn) {
      router.push('/check-in');
    }
  };

  const handleCheckOut = async () => {
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

      // Stop tracking
      locationTrackingService.stopTracking();

      // Send check-out data to server
      await axios.post('/api/checkOut', {
        location: currentLocation,
        address: addressFromCoords,
      });

      setTimeout(() => {
        liff.closeWindow();
        router.push('/checkin');
      }, 2000); // Close after 2 seconds
    } catch (error) {
      console.error('Check-out failed:', error);
    }
  };

  return (
    <div>
      <h1>Driver Check-Out</h1>
      {location && <Map center={location} />}
      <p>Current Address: {address}</p>
      <button onClick={handleCheckOut}>Check Out</button>
    </div>
  );
};

export default CheckOutPage;
