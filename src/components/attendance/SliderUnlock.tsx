import React, { useState, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

interface SliderUnlockProps {
  onUnlock: () => void;
  onCancel?: () => void;
  isEnabled?: boolean;
  lockedMessage?: string;
  unlockedMessage?: string;
  validation?: {
    message?: string;
    canProceed: boolean;
  };
}

const SliderUnlock: React.FC<SliderUnlockProps> = ({
  onUnlock,
  onCancel,
  isEnabled = true,
  lockedMessage = 'เลื่อนเพื่อยืนยันการลา',
  unlockedMessage = 'ปล่อยเพื่อยืนยัน',
  validation,
}) => {
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isEnabled || !validation?.canProceed) return;

    const slider = sliderRef.current;
    if (!slider) return;

    setIsDragging(true);
    const startX = e.clientX;
    const sliderRect = slider.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const maxTravel = containerRect.width - sliderRect.width;

    const handlePointerMove = (moveEvent: PointerEvent) => {
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
    <>
      {/* Validation Message */}
      {validation?.message && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">{validation.message}</div>
          </div>
        </div>
      )}

      {/* Slider Container */}
      <div
        ref={containerRef}
        className="relative w-72 h-14 bg-gray-100 rounded-full overflow-hidden shadow-inner"
        style={{ touchAction: 'none' }}
      >
        {/* Background Text */}
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none">
          {progress >= 90 ? unlockedMessage : lockedMessage}
        </div>

        {/* Slider Button */}
        <div
          ref={sliderRef}
          className={`absolute left-0 top-0 bottom-0 w-14 flex items-center justify-center 
            ${validation?.canProceed ? 'bg-red-600' : 'bg-gray-300'} 
            rounded-full cursor-grab transition-colors duration-200
            ${isDragging ? 'cursor-grabbing shadow-lg' : 'shadow-md'}`}
          style={{
            transform: `translateX(${progress}%)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          onPointerDown={handlePointerDown}
        >
          <div className="w-1 h-6 bg-white rounded-full opacity-75" />
        </div>
      </div>
    </>
  );
};

export default SliderUnlock;
