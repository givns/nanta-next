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

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="h-1 w-full bg-gray-200">
        <div
          className="h-full bg-green-500 transition-all duration-300 ease-out"
          style={{
            width: `${progress}%`,
            transition: 'width 0.3s ease-out',
          }}
        />
      </div>
      {/* Optional loading message */}
      {progress < 100 && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow text-sm text-gray-600">
          {phase === 1
            ? 'กำลังเริ่มต้นระบบ...'
            : phase === 2
              ? 'กำลังโหลดเชื่อมต่อระบบ...'
              : 'กำลังเตรียมระบบ...'}
        </div>
      )}
    </div>
  );
};

export default LoadingProgress;
