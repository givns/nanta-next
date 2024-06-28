import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface StaticMapProps {
  lat: number;
  lng: number;
  zoom?: number;
  width?: number;
  height?: number;
}

const StaticMap: React.FC<StaticMapProps> = ({
  lat,
  lng,
  zoom = 15,
  width = 400,
  height = 200,
}) => {
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.GOOGLE_MAPS_API;
    if (!apiKey) {
      setError('Google Maps API key is not set. Check your .env.local file.');
      return;
    }

    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
    setMapUrl(url);

    // Test the URL
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      })
      .catch((e) => {
        console.error('Error loading map:', e);
        setError(`Failed to load map: ${e.message}`);
      });
  }, [lat, lng, zoom, width, height]);

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
