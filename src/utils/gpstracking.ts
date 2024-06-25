// utils/gpsTracking.ts

import axios from 'axios';

let trackingInterval: NodeJS.Timeout | null = null;

export const startGPSTracking = (lineUserId: string) => {
  if (trackingInterval) {
    clearInterval(trackingInterval);
  }

  trackingInterval = setInterval(
    async () => {
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          },
        );

        await axios.post('/api/gpsLog', {
          lineUserId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (error) {
        console.error('Error logging GPS data:', error);
      }
    },
    5 * 60 * 1000,
  ); // Log every 5 minutes
};

export const stopGPSTracking = () => {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
};
