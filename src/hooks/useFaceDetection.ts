//useFaceDetection.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import Webcam from 'react-webcam';

console.log('TensorFlow version:', tf.version);
console.log('Face Detection Models:', faceDetection.SupportedModels);

export const useFaceDetection = (
  captureThreshold: number = 5,
  onPhotoCapture: (photo: string) => void,
) => {
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const faceDetectionCount = useRef(0);
  const [faceDetectionCountState, setFaceDetectionCountState] = useState(0);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeModel = async () => {
      try {
        // 1. Check WebGL support
        const webGLSupported = tf.findBackend('webgl') !== undefined;
        console.log('WebGL Support:', webGLSupported);

        if (!webGLSupported) {
          throw new Error('WebGL not supported');
        }

        // 2. Initialize TensorFlow
        await tf.setBackend('webgl');
        await tf.ready();
        console.log('TensorFlow initialized:', {
          backend: tf.getBackend(),
          memory: tf.memory(),
        });

        // 3. Create detector with specific model type
        const detector = await faceDetection.createDetector(
          faceDetection.SupportedModels.MediaPipeFaceDetector,
          {
            runtime: 'tfjs',
            modelType: 'short',
            maxFaces: 1,
            detectorModelUrl: undefined, // Let it use default URL
          },
        );
        console.log('Face detector created successfully');

        // Only update state if component is still mounted
        if (isMounted) {
          setModel(detector);
          setIsModelLoading(false);
          setMessage('กรุณาวางใบหน้าให้อยู่ในกรอบ');
        }
      } catch (error) {
        console.error('Model initialization error:', error);
        if (error instanceof Error) {
          console.error('Error details:', error.message, error.stack);
        }

        // Only update state if component is still mounted
        if (isMounted) {
          setIsModelLoading(false);
          setMessage('ไม่สามารถโหลดระบบตรวจจับใบหน้าได้');
        }
      }
    };

    initializeModel();

    // Cleanup
    return () => {
      isMounted = false;
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  const detectFace = useCallback(async () => {
    if (!webcamRef.current || !model) return;

    try {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) return;

      const img = new Image();
      img.src = imageSrc;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      console.log('Running face detection on image');
      const detections = await model.estimateFaces(img, {
        flipHorizontal: false,
      });

      console.log('Detection result:', {
        facesFound: detections.length,
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
      console.error('Face detection error:', error);
    }
  }, [model, captureThreshold, onPhotoCapture]);

  // Start detection when model is ready
  const startDetection = useCallback(() => {
    if (!model) return;

    console.log('Starting face detection');
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    detectionIntervalRef.current = setInterval(detectFace, 500);
  }, [detectFace, model]);

  useEffect(() => {
    if (model && !isModelLoading) {
      startDetection();
    }
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [model, isModelLoading, startDetection]);

  const resetDetection = useCallback(() => {
    faceDetectionCount.current = 0;
    setFaceDetectionCountState(0);
    setFaceDetected(false);
    startDetection();
  }, [startDetection]);

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
