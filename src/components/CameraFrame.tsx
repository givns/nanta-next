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
  // Calculate dimensions for the oval
  const overlayStyles = useMemo(
    () => ({
      width: '180px',
      height: '220px', // Taller than width for oval shape
      transform: 'translateY(-10px)', // Slight upward adjustment
    }),
    [],
  );

  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div className="relative aspect-[4/3] w-full bg-black rounded-lg overflow-hidden">
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          className="absolute inset-0 w-full h-full object-cover"
          videoConstraints={{
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 580 },
          }}
        />

        {/* Semi-transparent overlay with oval cutout */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" /> {/* Dark overlay */}
          <div
            className="relative flex items-center justify-center"
            style={overlayStyles}
          >
            {/* Oval outline */}
            <div
              style={{
                ...overlayStyles,
                position: 'absolute',
                border: `3px solid ${faceDetected ? '#22c55e' : '#3b82f6'}`,
                borderRadius: '50%',
                transition: 'all 0.3s ease',
                boxShadow: faceDetected
                  ? '0 0 10px rgba(34, 197, 94, 0.5)'
                  : '0 0 10px rgba(59, 130, 246, 0.5)',
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
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
          <p className="text-white text-center text-lg font-medium mb-2 drop-shadow">
            {message}
          </p>
          {faceDetectionCount > 0 && (
            <div className="w-full max-w-[80%] mx-auto">
              <div className="h-2 bg-gray-200/30 rounded-full overflow-hidden">
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
