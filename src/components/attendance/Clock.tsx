//components/Clock.tsx
import React, { useState, useEffect } from 'react';
import { getBangkokTime } from '../../utils/dateUtils';

const Clock1: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(
    getBangkokTime().toLocaleTimeString(),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getBangkokTime().toLocaleTimeString());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-3xl font-bold text-center mb-2 text-black-950">
      {currentTime}
    </div>
  );
};

export default React.memo(Clock1);
