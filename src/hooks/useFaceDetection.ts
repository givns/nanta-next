import { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import {
  FaceDetectionService,
  FACE_DETECTION_MESSAGES,
} from '../services/EnhancedFaceDetection';

export const useFaceDetection = (
  captureThreshold: number = 5,
  onPhotoCapture: (photo: string) => void,
) => {
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState<string>(
    FACE_DETECTION_MESSAGES.INITIALIZING,
  );
  const [faceDetectionCount, setFaceDetectionCount] = useState(0);

  const webcamRef = useRef<Webcam>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceDetectionService = useRef(FaceDetectionService.getInstance());
  const modelInitializedRef = useRef(false);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  const detectFace = useCallback(async () => {
    if (!webcamRef.current || !modelInitializedRef.current) return;

    try {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) return;

      const img = new Image();
      img.src = imageSrc;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
      });

      const faces = await faceDetectionService.current.detectFaces(img);

      if (faces.length > 0) {
        setFaceDetected(true);
        setFaceDetectionCount((prev) => {
          const newCount = prev + 1;
          if (newCount >= captureThreshold) {
            stopDetection();
            if (webcamRef.current?.stream) {
              webcamRef.current.stream
                .getTracks()
                .forEach((track) => track.stop());
            }
            onPhotoCapture(imageSrc);
            setMessage(FACE_DETECTION_MESSAGES.SUCCESS);
            return captureThreshold;
          }

          setMessage(FACE_DETECTION_MESSAGES.FACE_DETECTED);
          return newCount;
        });
      } else {
        setFaceDetected(false);
        setFaceDetectionCount(0);
        setMessage(FACE_DETECTION_MESSAGES.NO_FACE);
      }
    } catch (error) {
      console.error('Face detection error:', error);
      stopDetection();
      setMessage(FACE_DETECTION_MESSAGES.ERROR);
    }
  }, [captureThreshold, onPhotoCapture, stopDetection]);

  const startDetection = useCallback(() => {
    if (!modelInitializedRef.current) return;
    stopDetection();
    detectionIntervalRef.current = setInterval(detectFace, 500);
  }, [detectFace, stopDetection]);

  useEffect(() => {
    let mounted = true;
    console.log('Initializing face detection...'); // Debug log

    const initialize = async () => {
      try {
        await faceDetectionService.current.initialize();
        console.log('Face detection initialized'); // Debug log

        if (mounted) {
          modelInitializedRef.current = true;
          setIsModelLoading(false);
          setMessage(FACE_DETECTION_MESSAGES.READY);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Give webcam time to settle
          startDetection();
        }
      } catch (error) {
        console.error('Face detection initialization error:', error);
        if (mounted) {
          setIsModelLoading(false);
          setMessage(FACE_DETECTION_MESSAGES.LOAD_ERROR);
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      stopDetection();
      if (webcamRef.current?.stream) {
        webcamRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startDetection, stopDetection]);

  return {
    webcamRef,
    isModelLoading,
    faceDetected,
    faceDetectionCount,
    message,
    captureThreshold,
  };
};
