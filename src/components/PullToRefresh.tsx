import React, { useState } from 'react';
import {
  motion,
  AnimatePresence,
  useSpring,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { ArrowDownCircle } from 'lucide-react';

export interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  isRefreshing?: boolean;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);

  const pullThreshold = 100; // pixels to trigger refresh
  const y = useMotionValue(0);
  const rotateSpring = useSpring(0, { stiffness: 400, damping: 30 });

  const handleTouchStart = () => {
    if (!isRefreshing) {
      y.set(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isRefreshing) return;

    const touch = e.touches[0];
    const scrollTop = window.scrollY || document.documentElement.scrollTop;

    if (scrollTop <= 0) {
      const pull = Math.max(
        0,
        touch.clientY - (e.currentTarget as HTMLElement).offsetTop,
      );
      const progress = Math.min(1, pull / pullThreshold);
      y.set(pull);
      setPullProgress(progress);
      rotateSpring.set(progress * 360);
    }
  };

  const handleTouchEnd = async () => {
    if (isRefreshing) return;

    const shouldRefresh = pullProgress >= 1;

    if (shouldRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    y.set(0);
    setPullProgress(0);
  };

  return (
    <motion.div
      className="relative w-full min-h-screen"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      <AnimatePresence>
        {(pullProgress > 0 || isRefreshing) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: 1,
              height: isRefreshing ? 60 : Math.min(pullProgress * 60, 60),
            }}
            exit={{ opacity: 0, height: 0 }}
            className="absolute top-0 left-0 right-0 flex items-center justify-center bg-gray-50/80 backdrop-blur-sm z-10 overflow-hidden"
          >
            <motion.div
              style={{ rotate: rotateSpring }}
              className="flex items-center space-x-2 text-gray-600"
            >
              <ArrowDownCircle
                className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              <span className="text-sm font-medium">
                {isRefreshing
                  ? 'กำลังโหลด...'
                  : pullProgress >= 1
                    ? 'ปล่อยเพื่อรีเฟรช'
                    : 'ดึงลงเพื่อรีเฟรช'}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="relative">{children}</div>
    </motion.div>
  );
};

export default PullToRefresh;
