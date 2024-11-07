// components/CameraFrame.tsx
import React, { useMemo } from 'react';
import Webcam from 'react-webcam';

interface CameraFrameProps {
  webcamRef: React.RefObject<Webcam>;
  faceDetected: boolean;
  faceDetectionCount: number;
  message: string;
  captureThreshold: number;
}

const CameraFrame: React.FC<CameraFrameProps> = ({
  webcamRef,
  faceDetected,
  faceDetectionCount,
  message,
  captureThreshold,
}) => {
  // Calculate dimensions for the oval - larger for mobile screens
  const overlayStyles = useMemo(
    () => ({
      width: '280px', // Increased from 180px
      height: '340px', // Increased from 220px, maintaining proportion
      transform: 'translateY(-15px)', // Adjusted for new size
    }),
    [],
  );

  return (
    <div className="relative w-full h-full">
      <div className="relative w-full h-full bg-white">
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          className="absolute inset-0 w-full h-full object-cover"
          videoConstraints={{
            facingMode: 'user',
            width: { ideal: 1280 }, // Increased for better quality
            height: { ideal: 720 },
          }}
        />

        {/* Semi-transparent overlay with oval cutout */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative flex items-center justify-center"
            style={overlayStyles}
          >
            {/* Oval outline */}
            <div
              style={{
                ...overlayStyles,
                position: 'absolute',
                border: `4px solid ${faceDetected ? '#22c55e' : '#3b82f6'}`,
                borderRadius: '50%',
                transition: 'all 0.3s ease',
                boxShadow: faceDetected
                  ? '0 0 20px rgba(34, 197, 94, 0.5)'
                  : '0 0 20px rgba(59, 130, 246, 0.5)',
              }}
            />
            {/* Oval mask */}
            <div
              style={{
                ...overlayStyles,
                position: 'absolute',
                background: 'transparent',
                boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.4)',
                borderRadius: '50%',
                clipPath: 'ellipse(50% 50% at 50% 50%)',
              }}
            />
          </div>
        </div>

        {/* Status and progress */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <p className="text-white text-center text-xl font-medium mb-3 drop-shadow">
            {message}
          </p>
          {faceDetectionCount > 0 && (
            <div className="w-full max-w-[90%] mx-auto">
              <div className="h-3 bg-gray-200/30 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    faceDetected ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{
                    width: `${(faceDetectionCount / captureThreshold) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(CameraFrame);
