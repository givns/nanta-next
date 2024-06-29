import React, { useEffect, useRef } from 'react';

interface InteractiveMapProps {
  apiKey: string;
  lat: number;
  lng: number;
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({
  apiKey,
  lat,
  lng,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    const loadMap = () => {
      if (mapRef.current && !googleMapRef.current) {
        googleMapRef.current = new window.google.maps.Map(mapRef.current, {
          center: { lat, lng },
          zoom: 15,
        });

        new window.google.maps.Marker({
          position: { lat, lng },
          map: googleMapRef.current,
        });
      }
    };

    if (window.google) {
      loadMap();
    } else {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', loadMap);
      document.head.appendChild(script);
    }

    return () => {
      if (googleMapRef.current) {
        // Clean up the map instance if component unmounts
        // @ts-ignore
        googleMapRef.current = null;
      }
    };
  }, [apiKey, lat, lng]);

  return <div ref={mapRef} style={{ width: '100%', height: '300px' }} />;
};

export default InteractiveMap;
