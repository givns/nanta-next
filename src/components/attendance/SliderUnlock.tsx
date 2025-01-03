import React, { useState, useRef, useCallback } from 'react';
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
  const dragStartXRef = useRef(0);
  const initialSliderLeftRef = useRef(0);

  const updateProgress = useCallback(
    (clientX: number) => {
      if (!containerRef.current || !sliderRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const sliderWidth = sliderRef.current.offsetWidth;
      const maxTravel = containerRect.width - sliderWidth;

      const currentPosition =
        clientX - containerRect.left - dragStartXRef.current;
      const rawProgress = (currentPosition / maxTravel) * 100;
      const newProgress = Math.max(0, Math.min(rawProgress, 100));

      setProgress(newProgress);

      if (newProgress >= 90) {
        setIsDragging(false);
        setProgress(100);
        onUnlock();
      }
    },
    [onUnlock],
  );

  const handleEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      if (progress < 90) {
        setProgress(0);
        onCancel?.();
      }
    }
  }, [isDragging, progress, onCancel]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      updateProgress(e.clientX);
    },
    [isDragging, updateProgress],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      updateProgress(e.touches[0].clientX);
    },
    [isDragging, updateProgress],
  );

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });

      return () => {
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchend', handleEnd);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('touchmove', handleTouchMove);
      };
    }
  }, [isDragging, handleEnd, handleMouseMove, handleTouchMove]);

  const handleStart = useCallback(
    (clientX: number) => {
      if (!isEnabled || !validation?.canProceed || !sliderRef.current) return;

      const sliderRect = sliderRef.current.getBoundingClientRect();
      dragStartXRef.current = clientX - sliderRect.left;
      setIsDragging(true);
    },
    [isEnabled, validation?.canProceed],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isEnabled || !validation?.canProceed) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onUnlock();
      }
    },
    [isEnabled, validation?.canProceed, onUnlock],
  );

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

      <div
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        tabIndex={isEnabled ? 0 : -1}
        onKeyDown={handleKeyDown}
        className="relative w-72 h-14"
      >
        <div
          ref={containerRef}
          className="absolute inset-0 bg-gray-100 rounded-full overflow-hidden"
        >
          {/* Progress Bar */}
          <div
            className="absolute inset-y-0 left-0 bg-red-100 transition-all duration-75 ease-out"
            style={{ width: `${progress}%` }}
          />

          {/* Call to Action Text */}
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 select-none">
            {progress >= 90
              ? 'ปล่อยเพื่อยืนยัน'
              : 'เลื่อนเพื่อออกงานกรณีฉุกเฉิน'}
          </div>

          {/* Slider Thumb */}
          <div
            ref={sliderRef}
            role="presentation"
            aria-hidden="true"
            className={`absolute top-1 bottom-1 left-1 w-12
              ${isEnabled ? 'bg-purple-600' : 'bg-gray-300'}
              rounded-full shadow-lg flex items-center justify-center
              ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
              touch-none select-none`}
            style={{
              transform: `translateX(${progress * 2.48}px)`,
              transition: isDragging ? 'none' : 'all 0.2s ease-out',
            }}
            onMouseDown={(e) => handleStart(e.clientX)}
            onTouchStart={(e) => handleStart(e.touches[0].clientX)}
          >
            <div className="w-0.5 h-6 bg-white/75 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SliderUnlock;
