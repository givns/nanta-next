import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface StaticMapProps {
  apiKey: string;
  zoom?: number;
  width?: number;
  height?: number;
}

const StaticMap: React.FC<StaticMapProps> = ({
  apiKey,
  zoom = 15,
  width = 400,
  height = 200,
}) => {
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) {
      setError('Google Maps API key is not available.');
      return;
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const url = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=${zoom}&size=${width}x${height}&markers=color:red%7C${latitude},${longitude}&key=${apiKey}`;
          setMapUrl(url);
        },
        () => {
          setError('Unable to retrieve your location');
        },
      );
    } else {
      setError('Geolocation is not supported by your browser');
    }
  }, [apiKey, zoom, width, height]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!mapUrl) {
    return <div>Loading map...</div>;
  }

  return (
    <div
      className="static-map-container"
      style={{ maxWidth: `${width}px`, margin: '0 auto' }}
    >
      <Image
        src={mapUrl}
        alt="Static Map"
        width={width}
        height={height}
        className="rounded-lg"
      />
    </div>
  );
};

export default StaticMap;
