import { useState, useEffect } from 'react';

const factoryLocations = [
  { lat: 12.345, lng: 67.89 }, // Replace with actual factory locations
  { lat: 23.456, lng: 78.901 },
];

const isWithinGeofence = (lat: number, lng: number) => {
  const radius = 1000; // Geofencing radius in meters
  return factoryLocations.some((location) => {
    const distance = Math.sqrt(
      Math.pow(location.lat - lat, 2) + Math.pow(location.lng - lng, 2),
    );
    return distance <= radius;
  });
};

const useGeofencing = (lat: number, lng: number) => {
  const [isInGeofence, setIsInGeofence] = useState(true);

  useEffect(() => {
    setIsInGeofence(isWithinGeofence(lat, lng));
  }, [lat, lng]);

  return isInGeofence;
};

export default useGeofencing;
