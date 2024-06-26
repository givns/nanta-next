import { useState } from 'react';
import axios from 'axios';
import { locationTrackingService } from '../services/locationTrackingService';
import Map from '../components/GoogleMap';
import { getAddressFromCoordinates } from '../utils/geocoding';
const GeneralCheckPage = () => {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');

  const handleAction = async (
    action: 'checkIn' | 'checkpoint' | 'checkOut',
  ) => {
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

      await axios.post(`/api/${action}`, {
        location: currentLocation,
        address: addressFromCoords,
      });

      alert(`${action} successful!`);
    } catch (error) {
      console.error(`${action} failed:`, error);
    }
  };

  return (
    <div>
      <h1>Check-In/Out</h1>
      {location && <Map center={location} />}
      <p>Current Address: {address}</p>
      <button onClick={() => handleAction('checkIn')}>Check In</button>
      <button onClick={() => handleAction('checkpoint')}>Add Checkpoint</button>
      <button onClick={() => handleAction('checkOut')}>Check Out</button>
    </div>
  );
};

export default GeneralCheckPage;
