// components/LoadingBar.tsx
import React, { useState, useEffect } from 'react';

interface LoadingBarProps {
  step: 'auth' | 'user' | 'location' | 'ready';
}

const LoadingBar: React.FC<LoadingBarProps> = ({ step }) => {
  const [progress, setProgress] = useState(0);

  const steps = {
    auth: {
      message: 'ตรวจสอบสิทธิ์การเข้างาน',
      color: 'bg-blue-500',
      icon: '🔐',
    },
    user: {
      message: 'โหลดข้อมูลพนักงาน',
      color: 'bg-green-500',
      icon: '👤',
    },
    location: {
      message: 'ตรวจสอบตำแหน่ง',
      color: 'bg-yellow-500',
      icon: '📍',
    },
    ready: {
      message: 'เตรียมระบบบันทึกเวลา',
      color: 'bg-purple-500',
      icon: '✅',
    },
  };

  useEffect(() => {
    const target = { auth: 25, user: 50, location: 75, ready: 100 }[step];
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= target ? target : prev + 1));
    }, 30);
    return () => clearInterval(interval);
  }, [step]);

  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
      <div className="text-center">
        <div className="text-6xl mb-6 text-center animate-bounce">
          {currentStep.icon}
        </div>
        <div className="mb-4 text-xl font-semibold text-gray-700">
          {progress}%
        </div>
        <div className="w-64 bg-gray-200 rounded-full h-2 overflow-hidden mb-4">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${currentStep.color}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-gray-700 font-medium">{currentStep.message}</div>
      </div>
    </div>
  );
};

export default LoadingBar;
