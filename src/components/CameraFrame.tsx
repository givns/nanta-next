// components/CameraFrame.tsx
import React from 'react';
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
  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Aspect ratio container */}
      <div className="relative aspect-[4/3] w-full">
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          className="absolute inset-0 w-full h-full rounded-lg object-cover"
          videoConstraints={{
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          }}
        />
        {/* Overlay elements */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`border-4 ${
              faceDetected ? 'border-green-500' : 'border-blue-500'
            } rounded-full w-36 h-36 transition-colors duration-300`}
          />
        </div>
        {/* Progress bar and message container */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
          <p className="text-white text-shadow-lg text-center mb-2">
            {message}
          </p>
          {faceDetectionCount > 0 && (
            <div className="w-full bg-gray-200/30 rounded-full h-2">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(faceDetectionCount / captureThreshold) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraFrame;
