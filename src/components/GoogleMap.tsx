import React from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Circle,
} from '@react-google-maps/api';
interface GoogleMapComponentProps {
  lat: number;
  lng: number;
  accuracy?: number;
  onLoad?: () => void;
}

const GoogleMapComponent: React.FC<GoogleMapComponentProps> = ({
  lat,
  lng,
  accuracy,
  onLoad,
}) => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });

  const center = { lat, lng };

  const mapOptions = {
    center,
    zoom: accuracy ? Math.max(15 - Math.log2(accuracy), 10) : 15,
    mapContainerStyle: { width: '100%', height: '100%' },
  };

  return isLoaded ? (
    <GoogleMap {...mapOptions} onLoad={onLoad}>
      <Marker
        position={center}
        title={accuracy ? `Accuracy: ${accuracy}m` : undefined}
      />
      {accuracy && (
        <Circle
          center={center}
          radius={accuracy}
          options={{
            strokeColor: '#FF0000',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#FF0000',
            fillOpacity: 0.35,
          }}
        />
      )}
    </GoogleMap>
  ) : (
    <div>กำลังโหลดแผนที่...</div>
  );
};

export default GoogleMapComponent;
