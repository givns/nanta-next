import React from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

interface GoogleMapComponentProps {
  center: { lat: number; lng: number };
}

const GoogleMapComponent: React.FC<GoogleMapComponentProps> = ({ center }) => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });

  return isLoaded ? (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '300px' }}
      center={center}
      zoom={15}
    >
      <Marker position={center} />
    </GoogleMap>
  ) : (
    <div>Loading...</div>
  );
};

export default GoogleMapComponent;
