// hooks/useFaceDetection.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import Webcam from 'react-webcam';

export const useFaceDetection = (
  captureThreshold: number = 5,
  onPhotoCapture: (photo: string) => void,
) => {
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [loadingState, setLoadingState] = useState<string>('initializing');
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const faceDetectionCount = useRef(0);
  const [faceDetectionCountState, setFaceDetectionCountState] = useState(0);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Single model initialization useEffect
  useEffect(() => {
    const initializeTF = async () => {
      try {
        setLoadingState('initializing-tensorflow');
        console.log('Initializing TensorFlow...');

        if (!tf.getBackend()) {
          await tf.setBackend('webgl');
        }
        await tf.ready();

        const backend = tf.getBackend();
        console.log('TensorFlow initialized successfully. Backend:', backend);

        setLoadingState('loading-model');
        const modelConfig = {
          runtime: 'tfjs' as const,
          modelType: 'short' as const,
        };

        console.log('Loading face detection model with config:', modelConfig);
        const detector = await faceDetection.createDetector(
          faceDetection.SupportedModels.MediaPipeFaceDetector,
          modelConfig,
        );

        console.log('Face detection model loaded successfully');
        setModel(detector);
        setIsModelLoading(false);
        setMessage('กรุณาวางใบหน้าให้อยู่ในกรอบ');

        // Log successful initialization
        console.log('Face detection system ready:', {
          backend: tf.getBackend(),
          modelLoaded: !!detector,
          loadingState: 'completed',
        });
      } catch (error) {
        console.error('Face detection initialization error:', {
          state: loadingState,
          error,
          tfBackend: tf.getBackend(),
          tfReady: await tf
            .ready()
            .then(() => true)
            .catch(() => false),
        });

        let errorMessage = 'ไม่สามารถโหลดระบบตรวจจับใบหน้าได้';
        if (loadingState === 'initializing-tensorflow') {
          errorMessage = 'ไม่สามารถเริ่มต้นระบบ TensorFlow ได้';
        } else if (loadingState === 'loading-model') {
          errorMessage = 'ไม่สามารถโหลดโมเดลตรวจจับใบหน้าได้';
        }

        setMessage(errorMessage);
        setIsModelLoading(false);
      }
    };

    initializeTF();

    // Cleanup
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  const detectFace = useCallback(async () => {
    if (!webcamRef.current || !model) {
      console.log('Skip detection:', {
        hasWebcam: !!webcamRef.current,
        hasModel: !!model,
      });
      return;
    }

    try {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) return;

      const img = new Image();
      img.src = imageSrc;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const detections = await model.estimateFaces(img, {
        flipHorizontal: false,
      });

      console.log('Face detection result:', {
        facesDetected: detections.length,
        currentCount: faceDetectionCount.current,
      });

      if (detections.length > 0) {
        setFaceDetected(true);
        faceDetectionCount.current += 1;
        setFaceDetectionCountState(faceDetectionCount.current);
        setMessage('ตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...');

        if (faceDetectionCount.current >= captureThreshold) {
          if (imageSrc) {
            onPhotoCapture(imageSrc);
            setMessage('บันทึกภาพสำเร็จ');
            if (detectionIntervalRef.current) {
              clearInterval(detectionIntervalRef.current);
            }
          }
        }
      } else {
        setFaceDetected(false);
        faceDetectionCount.current = 0;
        setFaceDetectionCountState(0);
        setMessage('ไม่พบใบหน้า กรุณาวางใบหน้าให้อยู่ในกรอบ');
      }
    } catch (error) {
      console.error('Error in face detection:', error);
      setMessage('เกิดข้อผิดพลาดในการตรวจจับใบหน้า');
    }
  }, [model, captureThreshold, onPhotoCapture]);

  const startDetection = useCallback(() => {
    console.log('Starting face detection interval');
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    detectionIntervalRef.current = setInterval(detectFace, 500);
  }, [detectFace]);

  const resetDetection = useCallback(() => {
    console.log('Resetting face detection');
    faceDetectionCount.current = 0;
    setFaceDetectionCountState(0);
    setFaceDetected(false);
    startDetection();
  }, [startDetection]);

  useEffect(() => {
    if (!isModelLoading && model) {
      console.log('Model ready, starting detection');
      startDetection();
    }
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [isModelLoading, model, startDetection]);

  return {
    webcamRef,
    isModelLoading,
    faceDetected,
    faceDetectionCount: faceDetectionCountState,
    message,
    resetDetection,
    captureThreshold,
  };
};
