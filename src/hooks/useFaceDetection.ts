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
  const [modelLoadStarted, setModelLoadStarted] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState<string>('กำลังเริ่มต้นระบบ...');
  const webcamRef = useRef<Webcam>(null);
  const faceDetectionCount = useRef(0);
  const [faceDetectionCountState, setFaceDetectionCountState] = useState(0);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Single model initialization effect
  useEffect(() => {
    if (!modelLoadStarted) {
      console.log('Starting model initialization');
      setModelLoadStarted(true);

      const loadModel = async () => {
        try {
          console.log('Initializing TensorFlow...');
          await tf.ready();
          console.log('TF ready, current backend:', tf.getBackend());

          const loadedModel = await faceDetection.createDetector(
            faceDetection.SupportedModels.MediaPipeFaceDetector,
            {
              runtime: 'tfjs',
              modelType: 'short',
              maxFaces: 1,
            },
          );

          console.log('Face detection model loaded successfully');
          setModel(loadedModel);
          setIsModelLoading(false);
          setMessage('กรุณาวางใบหน้าให้อยู่ในกรอบ');
        } catch (error) {
          console.error('Model load error:', error);
          setIsModelLoading(false);
          setMessage('ไม่สามารถโหลดระบบตรวจจับใบหน้าได้');
        }
      };

      loadModel();
    }
  }, [modelLoadStarted]);

  const capturePhoto = useCallback(() => {
    if (!webcamRef.current) return null;

    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      onPhotoCapture(imageSrc);
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    }
    return imageSrc;
  }, [onPhotoCapture]);

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

      const detections = await model.estimateFaces(img, {
        flipHorizontal: false,
      });

      if (detections.length > 0) {
        setFaceDetected(true);
        faceDetectionCount.current += 1;
        setFaceDetectionCountState(faceDetectionCount.current);
        setMessage('ตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...');

        if (faceDetectionCount.current >= captureThreshold) {
          capturePhoto();
          setMessage('บันทึกภาพสำเร็จ');
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
  }, [model, captureThreshold, capturePhoto]);

  const startDetection = useCallback(() => {
    console.log('Starting face detection');
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    detectionIntervalRef.current = setInterval(detectFace, 500);
  }, [detectFace]);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  const resetDetection = useCallback(() => {
    console.log('Resetting detection');
    faceDetectionCount.current = 0;
    setFaceDetectionCountState(0);
    setFaceDetected(false);
    stopDetection();
    startDetection();
  }, [startDetection, stopDetection]);

  // Start/stop detection based on model availability
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
    faceDetectionCount: faceDetectionCountState,
    message,
    resetDetection,
    captureThreshold,
  };
};
