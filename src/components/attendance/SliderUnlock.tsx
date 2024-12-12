import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Minus } from 'lucide-react';

interface SliderUnlockProps {
  onUnlock: () => void;
  isEnabled?: boolean;
  lockedMessage?: string;
  unlockedMessage?: string;
  onCancel?: () => void;
}

export const SliderUnlock: React.FC<SliderUnlockProps> = ({
  onUnlock,
  isEnabled = true,
  lockedMessage = 'Slide to confirm early checkout',
  unlockedMessage = 'Release to confirm sick leave request',
  onCancel,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const resetSlider = useCallback(() => {
    setProgress(0);
    setIsDragging(false);
  }, []);

  const handleUnlock = useCallback(() => {
    if (progress >= 100) {
      onUnlock();
      resetSlider();
    }
  }, [progress, onUnlock, resetSlider]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!sliderRef.current || !containerRef.current || !isDragging) return;

      const container = containerRef.current;
      const slider = sliderRef.current;
      const containerWidth = container.clientWidth - slider.clientWidth;

      // Calculate new position
      const newPosition = Math.max(
        0,
        Math.min(
          e.clientX -
            container.getBoundingClientRect().left -
            slider.clientWidth / 2,
          containerWidth,
        ),
      );

      // Calculate progress percentage
      const progressPercentage = (newPosition / containerWidth) * 100;

      // Use animation frame for smoother updates
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        setProgress(progressPercentage);
      });
    },
    [isDragging],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isDragging) return;

      // Check if fully unlocked
      handleUnlock();

      // If not fully unlocked, allow cancellation
      if (progress < 100 && onCancel) {
        onCancel();
      }

      // Existing reset logic
      handleUnlock();
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      resetSlider();
    },
    [
      isDragging,
      handlePointerMove,
      handleUnlock,
      resetSlider,
      onCancel,
      progress,
    ],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isEnabled) return;

      setIsDragging(true);

      // Add event listeners to document to handle drag outside the component
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [isEnabled, handlePointerMove, handlePointerUp],
  );

  // Cleanup event listeners
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-16 bg-gray-200 rounded-full overflow-hidden ${
        !isEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
      onPointerDown={handlePointerDown}
    >
      {/* Background Message */}
      <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none">
        {progress < 100 ? lockedMessage : unlockedMessage}
      </div>

      {/* Slider */}
      <div
        ref={sliderRef}
        className={`absolute left-0 top-0 bottom-0 w-16 bg-primary rounded-full transition-all duration-100 ${
          isDragging ? 'shadow-lg' : 'shadow-md'
        }`}
        style={{
          transform: `translateX(${progress}%)`,
          opacity: isEnabled ? 1 : 0.5,
        }}
      >
        <div className="w-full h-full flex items-center justify-center">
          <Minus className="text-white" />
        </div>
      </div>
    </div>
  );
};

export default SliderUnlock;
