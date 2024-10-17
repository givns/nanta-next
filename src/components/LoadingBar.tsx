// components/LoadingBar.tsx
import React from 'react';

const LoadingBar: React.FC = () => (
  <div className="fixed top-0 left-0 right-0 h-1 bg-red-200">
    <div
      className="h-full bg-red-500 animate-pulse"
      style={{ width: '75%' }}
    ></div>
  </div>
);

export default LoadingBar;
