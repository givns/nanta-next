// useFaceDetection.ts
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

  // Load model once on mount
  useEffect(() => {
    const setupModel = async () => {
      try {
        await tf.setBackend('webgl');
        await tf.ready();

        const detector = await faceDetection.createDetector(
          faceDetection.SupportedModels.MediaPipeFaceDetector,
          {
            runtime: 'tfjs',
            modelType: 'short',
          },
        );

        setModel(detector);
        setIsModelLoading(false);
        setMessage('กรุณาวางใบหน้าให้อยู่ในกรอบ');
      } catch {
        setIsModelLoading(false);
        setMessage('ไม่สามารถโหลดระบบตรวจจับใบหน้าได้');
      }
    };

    setupModel();
  }, []);

  // Face detection function
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
    } catch {
      stopDetection();
      setMessage('เกิดข้อผิดพลาดในการตรวจจับใบหน้า');
    }
  }, [model, captureThreshold, onPhotoCapture]);

  // Start detection
  const startDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    detectionIntervalRef.current = setInterval(detectFace, 500);
  }, [detectFace]);

  // Stop detection
  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  // Reset detection
  const resetDetection = useCallback(() => {
    setFaceDetectionCount(0);
    setFaceDetected(false);
    stopDetection();
    startDetection();
  }, [startDetection, stopDetection]);

  // Start/stop detection when model is ready
  useEffect(() => {
    if (model && !isModelLoading) {
      startDetection();
    }
    return () => stopDetection();
  }, [model, isModelLoading, startDetection, stopDetection]);

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
