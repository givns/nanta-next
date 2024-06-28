import React from 'react';
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
  const apiKey = process.env.GOOGLE_MAPS_API;

  if (!apiKey) {
    console.error('Google Maps API key is not set');
    return <div>Map cannot be loaded</div>;
  }

  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=color:red%7C${lat},${lng}&key=${apiKey}`;

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
