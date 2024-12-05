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
  // States
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState<string>(
    FACE_DETECTION_MESSAGES.INITIALIZING,
  );
  const [faceDetectionCount, setFaceDetectionCount] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);

  // Refs
  const webcamRef = useRef<Webcam>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const faceDetectionService = useRef(FaceDetectionService.getInstance());

  // Cleanup helper
  const cleanup = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }
    if (webcamRef.current?.stream) {
      webcamRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    faceDetectionService.current.cleanup();
  }, []);

  // Stop detection helper
  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  // Face detection logic
  const detectFace = useCallback(async () => {
    if (!webcamRef.current || !cameraReady) return;

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
  }, [captureThreshold, onPhotoCapture, stopDetection, cameraReady]);

  // Start detection
  const startDetection = useCallback(() => {
    stopDetection();
    detectionIntervalRef.current = setInterval(detectFace, 500);
  }, [detectFace, stopDetection]);

  // Reset detection
  const resetDetection = useCallback(() => {
    setFaceDetectionCount(0);
    setFaceDetected(false);
    stopDetection();
    startDetection();
  }, [startDetection, stopDetection]);

  // Initialization effect
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        setIsModelLoading(true);
        setInitializationError(null);

        // Set initialization timeout
        initTimeoutRef.current = setTimeout(() => {
          if (mounted && isModelLoading) {
            setInitializationError(
              'Camera initialization timed out. Please try again.',
            );
            cleanup();
          }
        }, 10000);

        // Initialize face detection service
        await faceDetectionService.current.initialize();

        // Wait for camera to be ready
        await new Promise<void>((resolve) => {
          const checkCamera = setInterval(() => {
            if (webcamRef.current?.video?.readyState === 4) {
              clearInterval(checkCamera);
              resolve();
            }
          }, 100);
        });

        if (mounted) {
          setCameraReady(true);
          setIsModelLoading(false);
          setMessage(FACE_DETECTION_MESSAGES.READY);
          startDetection();
        }
      } catch (error) {
        if (mounted) {
          console.error('Camera initialization error:', error);
          setInitializationError(
            error instanceof Error
              ? error.message
              : 'Failed to initialize camera',
          );
          setIsModelLoading(false);
          setMessage(FACE_DETECTION_MESSAGES.LOAD_ERROR);
        }
      } finally {
        if (initTimeoutRef.current) {
          clearTimeout(initTimeoutRef.current);
          initTimeoutRef.current = null;
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [cleanup, startDetection]);

  // Return hook interface
  return {
    webcamRef,
    isModelLoading,
    initializationError,
    faceDetected,
    faceDetectionCount,
    message,
    resetDetection,
    captureThreshold,
    cameraReady,
  };
};
