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
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const [faceDetectionCount, setFaceDetectionCount] = useState(0);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load model with fallback if WebGL fails
  useEffect(() => {
    let mounted = true;

    const setupModel = async () => {
      setMessage('กำลังเริ่มต้นระบบ...');
      setIsModelLoading(true);

      const tryLoadModel = async (backend: 'webgl' | 'cpu') => {
        try {
          await tf.setBackend(backend);
          await tf.ready();

          const detector = await faceDetection.createDetector(
            faceDetection.SupportedModels.MediaPipeFaceDetector,
            {
              runtime: 'tfjs',
              modelType: 'short',
            },
          );

          if (mounted) {
            setModel(detector);
            setIsModelLoading(false);
            setMessage('กรุณาวางใบหน้าให้อยู่ในกรอบ');
          }
        } catch (error) {
          console.error(`Failed to load model with ${backend} backend:`, error);
          if (backend === 'webgl' && mounted) {
            setMessage('WebGL failed, retrying with CPU...');
            await tryLoadModel('cpu');
          } else {
            setIsModelLoading(false);
            setMessage('ไม่สามารถโหลดระบบตรวจจับใบหน้าได้');
          }
        }
      };

      if (tf.ENV.getBool('WEBGL_VERSION')) {
        // Attempt to load with WebGL first if available
        await tryLoadModel('webgl');
      } else {
        // Fallback to CPU if WebGL is not supported
        setMessage('WebGL not supported, using CPU...');
        await tryLoadModel('cpu');
      }
    };

    setupModel();

    return () => {
      mounted = false;
      tf.engine().reset();
    };
  }, []);

  const detectFace = useCallback(async () => {
    if (!webcamRef.current || !model) return;

    try {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) return;

      const img = new Image();
      img.src = imageSrc;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
      });

      const faces = await model.estimateFaces(img);

      if (faces.length > 0) {
        setFaceDetected(true);
        setFaceDetectionCount((prev) => {
          const newCount = prev + 1;
          if (newCount >= captureThreshold) {
            onPhotoCapture(imageSrc);
            stopDetection();
            setMessage('บันทึกภาพสำเร็จ');
            return captureThreshold;
          }
          setMessage('ตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...');
          return newCount;
        });
      } else {
        setFaceDetected(false);
        setFaceDetectionCount(0);
        setMessage('ไม่พบใบหน้า กรุณาวางใบหน้าให้อยู่ในกรอบ');
      }
    } catch (error) {
      console.error('Error during face detection:', error);
      stopDetection();
      setMessage('เกิดข้อผิดพลาดในการตรวจจับใบหน้า');
    }
  }, [model, captureThreshold, onPhotoCapture]);

  const startDetection = useCallback(() => {
    stopDetection();
    detectionIntervalRef.current = setInterval(detectFace, 500);
  }, [detectFace]);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  const resetDetection = useCallback(() => {
    setFaceDetectionCount(0);
    setFaceDetected(false);
    stopDetection();
    startDetection();
  }, [startDetection, stopDetection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDetection();
      if (webcamRef.current?.stream) {
        const tracks = webcamRef.current.stream.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [stopDetection]);

  // Start detection when model is ready
  useEffect(() => {
    if (model && !isModelLoading) {
      startDetection();
    }
  }, [model, isModelLoading, startDetection]);

  return {
    webcamRef,
    isModelLoading,
    faceDetected,
    faceDetectionCount,
    message,
    resetDetection,
    captureThreshold,
  };
};
