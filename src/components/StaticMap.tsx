import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface StaticMapProps {
  lat: number;
  lng: number;
  apiKey: string;
  zoom?: number;
  width?: number;
  height?: number;
}

const StaticMap: React.FC<StaticMapProps> = ({
  lat,
  lng,
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

    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
    setMapUrl(url);
  }, [lat, lng, zoom, width, height, apiKey]);

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
        className="rounded-lg shadow-md"
      />
    </div>
  );
};

export default StaticMap;
