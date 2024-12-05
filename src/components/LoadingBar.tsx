// components/LoadingBar.tsx
import React, { useState, useEffect } from 'react';

const LoadingBar: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prevProgress) => {
        if (prevProgress >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prevProgress + 1;
      });
    }, 50); // Adjust this value to change the speed of the progress bar

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75 z-50">
      <div className="w-64 text-center">
        <div className="mb-2 text-lg font-semibold text-gray-700">
          {progress}%
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="mt-4 text-gray-600">กรุณารอสักครู่...</div>
      </div>
    </div>
  );
};

export default LoadingBar;
