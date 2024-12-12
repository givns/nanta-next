import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Minus } from 'lucide-react';

interface SliderUnlockProps {
  onUnlock: () => void;
  isEnabled?: boolean;
  lockedMessage?: string;
  unlockedMessage?: string;
  onCancel?: () => void;
}

export // In SliderUnlock.tsx
const SliderUnlock: React.FC<SliderUnlockProps> = ({
  onUnlock,
  onCancel,
  lockedMessage = 'Slide to confirm',
  unlockedMessage = 'Release to confirm',
  isEnabled = true,
}) => {
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isEnabled) return;

    const container = containerRef.current;
    const slider = sliderRef.current;
    if (!container || !slider) return;

    const startX = e.clientX - container.getBoundingClientRect().left;
    const containerWidth = container.offsetWidth - slider.offsetWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const currentX =
        moveEvent.clientX - container.getBoundingClientRect().left;
      const newProgress = Math.max(
        0,
        Math.min((currentX / containerWidth) * 100, 100),
      );
      setProgress(newProgress);

      if (newProgress >= 100) {
        onUnlock();
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      }
    };

    const handlePointerUp = () => {
      if (progress < 100) {
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
    <div
      ref={containerRef}
      className="w-full px-4"
      onPointerDown={handlePointerDown}
    >
      <div className="relative h-16 bg-gray-200 rounded-full overflow-hidden">
        {/* Background Message */}
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none">
          {progress < 100 ? lockedMessage : unlockedMessage}
        </div>

        {/* Slider */}
        <div
          ref={sliderRef}
          className="absolute left-0 top-0 bottom-0 w-16 bg-primary rounded-full"
          style={{
            transform: `translateX(${progress}%)`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      </div>
    </div>
  );
};

export default SliderUnlock;
