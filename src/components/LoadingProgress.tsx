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
  const [phase, setPhase] = useState(1);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    // Phase 1: LIFF Initialization (0-40%)
    if (phase === 1) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev < 40) {
            return prev + 0.5;
          }
          if (isLiffInitialized) {
            setPhase(2);
          }
          return 40;
        });
      }, 50);
    }
    // Phase 2: Data Loading (40-80%)
    else if (phase === 2 && isLiffInitialized) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev < 80) {
            return prev + 0.8;
          }
          if (isDataLoaded) {
            setPhase(3);
          }
          return 80;
        });
      }, 50);
    }
    // Phase 3: Final Animation (80-100%)
    else if (phase === 3 && isDataLoaded) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev < 100) {
            return prev + 1;
          }
          setFadeOut(true);
          return 100;
        });
      }, 20);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [phase, isLiffInitialized, isDataLoaded]);

  const getLoadingMessage = () => {
    switch (phase) {
      case 1:
        return {
          main: 'กำลังเริ่มต้นระบบ',
          sub: 'โปรดรอสักครู่...',
        };
      case 2:
        return {
          main: 'กำลังเชื่อมต่อระบบ',
          sub: 'กำลังตรวจสอบข้อมูล...',
        };
      default:
        return {
          main: 'กำลังเตรียมระบบ',
          sub: 'เกือบพร้อมแล้ว...',
        };
    }
  };

  if (progress === 100 && fadeOut) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-50 bg-red-600 transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
    >
      {/* Loading Content */}
      <div className="flex flex-col items-center justify-center h-full">
        {/* Logo Placeholder */}
        <div className="w-24 h-24 mb-8 rounded-full bg-white/20 animate-pulse" />

        {/* Loading Messages */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">
            {getLoadingMessage().main}
          </h2>
          <p className="text-white/80">{getLoadingMessage().sub}</p>
        </div>

        {/* Progress Bar */}
        <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Progress Percentage */}
        <div className="mt-4 text-white/80">{Math.round(progress)}%</div>
      </div>

      {/* Bottom Wave Animation */}
      <div className="absolute bottom-0 left-0 right-0 h-24 overflow-hidden">
        <div
          className="absolute bottom-0 left-0 right-0 h-24 bg-white/10 animate-wave"
          style={{
            maskImage:
              'linear-gradient(to bottom, transparent 50%, black 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 50%, black 100%)',
          }}
        />
      </div>
    </div>
  );
};

export default LoadingProgress;
