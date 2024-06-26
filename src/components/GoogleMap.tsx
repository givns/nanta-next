import React from 'react';
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';

interface MapProps {
  center: { lat: number; lng: number };
}

const containerStyle = {
  width: '100%',
  height: '400px',
};

const Map: React.FC<MapProps> = ({ center }) => {
  const apiKey = 'YOUR_GOOGLE_MAPS_API_KEY'; // Replace with your actual API key

  return (
    <LoadScript googleMapsApiKey={apiKey}>
      <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={15}>
        <Marker position={center} />
      </GoogleMap>
    </LoadScript>
  );
};

export default Map;
