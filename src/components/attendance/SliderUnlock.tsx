import React, { useState, useRef, useEffect } from 'react';
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

  // Reset progress when not dragging
  useEffect(() => {
    if (!isDragging && progress < 90) {
      const timer = setTimeout(() => setProgress(0), 200);
      return () => clearTimeout(timer);
    }
  }, [isDragging, progress]);

  const updateProgress = (clientX: number) => {
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
  };

  const handleStart = (clientX: number) => {
    if (!isEnabled || !validation?.canProceed || !sliderRef.current) return;

    const sliderRect = sliderRef.current.getBoundingClientRect();
    dragStartXRef.current = clientX - sliderRect.left;
    initialSliderLeftRef.current = sliderRect.left;
    setIsDragging(true);
  };

  const handleEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      if (progress < 90) {
        onCancel?.();
      }
    }
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    updateProgress(e.touches[0].clientX);
  };

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    handleStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    updateProgress(e.clientX);
  };

  useEffect(() => {
    const handleMouseUp = () => handleEnd();
    const handleTouchEnd = () => handleEnd();

    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('mousemove', handleMouseMove as any);
      window.addEventListener('touchmove', handleTouchMove as any, {
        passive: false,
      });
    }

    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('mousemove', handleMouseMove as any);
      window.removeEventListener('touchmove', handleTouchMove as any);
    };
  }, [isDragging]);

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
        {/* Track */}
        <div
          ref={containerRef}
          className="absolute inset-0 bg-gray-100 rounded-full overflow-hidden"
        >
          {/* Progress Bar */}
          <div
            className={`absolute inset-y-0 left-0 bg-red-100 transition-all duration-75 ease-out`}
            style={{ width: `${progress}%` }}
          />

          {/* Call to Action Text */}
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 select-none">
            {progress >= 90 ? 'ปล่อยเพื่อยืนยัน' : 'เลื่อนเพื่อยืนยันการออกงาน'}
          </div>

          {/* Slider Thumb */}
          <div
            ref={sliderRef}
            className={`absolute top-1 bottom-1 left-1 w-12
              ${isEnabled ? 'bg-red-600' : 'bg-gray-300'}
              rounded-full shadow-lg flex items-center justify-center
              ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
              touch-none select-none`}
            style={{
              transform: `translateX(${progress * 2.48}px)`, // Adjusted for better tracking
              transition: isDragging ? 'none' : 'all 0.2s ease-out',
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            <div className="w-0.5 h-6 bg-white/75 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SliderUnlock;
