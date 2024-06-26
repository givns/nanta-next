import React, { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const LeafletMap = dynamic(() => import('../components/LeafletMap'), {
  ssr: false,
});

interface MapProps {
  center: { lat: number; lng: number };
  zoom?: number;
}

const Map: React.FC<MapProps> = ({ center, zoom = 13 }) => {
  return <LeafletMap center={center} zoom={zoom} />;
};

export default Map;
