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

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isEnabled) return;

    const slider = sliderRef.current;
    if (!slider) return;

    setIsDragging(true);
    const startX = e.clientX;
    const sliderRect = slider.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const maxTravel = containerRect.width - sliderRect.width;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const newProgress = Math.max(
        0,
        Math.min((deltaX / maxTravel) * 100, 100),
      );
      setProgress(newProgress);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      if (progress >= 90) {
        setProgress(100);
        onUnlock();
      } else {
        setProgress(0);
        onCancel?.();
      }
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Validation Message - Separated from button */}
      {validation?.message && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">{validation.message}</div>
          </div>
        </div>
      )}

      {/* Slider Container */}
      <div className="relative w-72 h-14">
        <div
          ref={containerRef}
          className="absolute inset-0 bg-gray-100 rounded-full overflow-hidden shadow-inner"
          style={{ touchAction: 'none' }}
        >
          {/* Call to Action Text */}
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none select-none">
            {progress >= 90 ? 'ปล่อยเพื่อยืนยัน' : 'เลื่อนเพื่อยืนยันการออกงาน'}
          </div>

          {/* Slider Button */}
          <div
            ref={sliderRef}
            className={`absolute left-0 top-0 bottom-0 w-14 flex items-center justify-center 
              ${isEnabled ? 'bg-red-600 cursor-grab active:cursor-grabbing' : 'bg-gray-300'} 
              rounded-full shadow-md transition-colors duration-200`}
            style={{
              transform: `translateX(${progress}%)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
            onPointerDown={handlePointerDown}
          >
            <div className="w-1 h-6 bg-white rounded-full opacity-75" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SliderUnlock;
