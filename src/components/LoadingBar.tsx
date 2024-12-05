// components/LoadingBar.tsx
import React, { useState, useEffect } from 'react';

interface LoadingBarProps {
  step: 'auth' | 'user' | 'location' | 'ready';
}

const LoadingBar: React.FC<LoadingBarProps> = ({ step }) => {
  const [progress, setProgress] = useState(0);
  const getProgressTarget = () => {
    switch (step) {
      case 'auth':
        return 33;
      case 'user':
        return 66;
      case 'location':
        return 99;
      case 'ready':
        return 100;
    }
  };

  useEffect(() => {
    const target = getProgressTarget();
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= target) {
          clearInterval(interval);
          return target;
        }
        return prev + 1;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [step]);

  const getMessage = () => {
    switch (step) {
      case 'auth':
        return 'กำลังตรวจสอบสิทธิ์...';
      case 'user':
        return 'กำลังโหลดข้อมูลผู้ใช้...';
      case 'location':
        return 'กำลังตรวจสอบตำแหน่ง...';
      case 'ready':
        return 'กำลังเตรียมระบบ...';
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-white to-gray-100 z-50">
      <div className="w-72 text-center">
        <div className="mb-4 text-lg font-semibold text-gray-700">
          {progress}%
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-6 text-gray-700 font-medium">{getMessage()}</div>
      </div>
    </div>
  );
};

export default LoadingBar;
