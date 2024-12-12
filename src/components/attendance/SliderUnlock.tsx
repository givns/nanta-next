import React, { useState, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

interface SliderUnlockProps {
  onUnlock: () => void;
  onCancel?: () => void;
  validation?: {
    message?: string;
    canProceed: boolean;
  };
  isEnabled?: boolean;
}

const SliderUnlock: React.FC<SliderUnlockProps> = ({
  onUnlock,
  onCancel,
  validation,
  isEnabled = true,
}) => {
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isEnabled || !validation?.canProceed) return;

    const container = containerRef.current;
    const slider = sliderRef.current;
    if (!container || !slider) return;

    setIsDragging(true);
    startXRef.current = e.clientX - slider.getBoundingClientRect().left;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!container || !slider) return;

      const maxTravel = container.clientWidth - slider.clientWidth;
      const currentX =
        moveEvent.clientX -
        container.getBoundingClientRect().left -
        startXRef.current;
      const newProgress = Math.max(
        0,
        Math.min((currentX / maxTravel) * 100, 100),
      );

      setProgress(newProgress);

      // Prevent scrolling while dragging
      moveEvent.preventDefault();
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      if (progress >= 90) {
        setProgress(100);
        onUnlock();
      } else {
        setProgress(0);
        onCancel?.();
      }
    };

    document.addEventListener('pointermove', handlePointerMove, {
      passive: false,
    });
    document.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {validation?.message && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">{validation.message}</div>
          </div>
        </div>
      )}

      <div className="relative w-72 h-14">
        <div
          ref={containerRef}
          className="absolute inset-0 bg-gray-100 rounded-full overflow-hidden shadow-inner"
          style={{ touchAction: 'none' }}
        >
          {/* Progress Bar Background */}
          <div
            className="absolute inset-y-0 left-0 bg-red-100 transition-all duration-75"
            style={{ width: `${progress}%` }}
          />

          {/* Call to Action Text */}
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none select-none">
            {progress >= 90 ? 'ปล่อยเพื่อยืนยัน' : 'เลื่อนเพื่อยืนยันการออกงาน'}
          </div>

          {/* Slider Button */}
          <div
            ref={sliderRef}
            className={`absolute left-0 top-1 bottom-1 w-12 flex items-center justify-center 
              ${isEnabled ? 'bg-red-600 cursor-grab active:cursor-grabbing' : 'bg-gray-300'} 
              rounded-full shadow-md transition-colors duration-200`}
            style={{
              transform: `translateX(${progress}%)`,
              transition: isDragging ? 'none' : 'all 0.2s ease-out',
            }}
            onPointerDown={handlePointerDown}
          >
            <div className="w-0.5 h-6 bg-white rounded-full opacity-75" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SliderUnlock;
