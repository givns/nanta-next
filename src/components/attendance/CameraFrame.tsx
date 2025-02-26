//cameraframe component to display the camera feed and the face detection overlay
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
    <div className="h-full w-full relative bg-black">
      {/* Camera Layer */}
      <Webcam
        audio={false}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        className="absolute inset-0 h-full w-full object-cover"
        videoConstraints={{
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }}
      />

      {/* Overlay Layer */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={`border-4 rounded-full transition-colors duration-300 ease-in-out ${
            faceDetected ? 'border-green-500' : 'border-blue-500'
          }`}
          style={{
            width: '280px',
            height: '340px',
            transform: 'translateY(-15px)',
          }}
        />
      </div>

      {/* Bottom Message Layer */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <p className="text-white text-center text-xl font-medium mb-4 drop-shadow">
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
  );
};

export default React.memo(CameraFrame);
