import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

interface LoadingProgressProps {
  isLiffInitialized?: boolean;
  isDataLoaded?: boolean;
}

const LoadingProgress: React.FC<LoadingProgressProps> = ({
  isLiffInitialized = false,
  isDataLoaded = false,
}) => {
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) =>
        prev < 95 ? prev + (isLiffInitialized ? 2 : 1) : 100,
      );
    }, 50);
    return () => clearInterval(interval);
  }, [isLiffInitialized]);

  const getLoadingMessage = () => {
    if (router.pathname === '/register') {
      return {
        title: 'เตรียมลงทะเบียน',
        description: 'กำลังเชื่อมต่อข้อมูลผู้ใช้...',
        icon: '👤',
      };
    }

    if (!isLiffInitialized) {
      return {
        title: 'เริ่มเชื่อมต่อ LINE',
        description: 'กำลังตรวจสอบข้อมูล...',
        icon: '🔗',
      };
    }

    return {
      title: 'ตรวจสอบสิทธิ์การเข้าใช้',
      description: 'กำลังโหลดข้อมูลส่วนตัว...',
      icon: '🔐',
    };
  };

  const { title, description, icon } = getLoadingMessage();

  return (
    <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-6 text-center animate-pulse">{icon}</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{title}</h1>
        <p className="text-gray-600 mb-6">{description}</p>

        <div className="w-64 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-sm text-gray-500">
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
};

export default LoadingProgress;
