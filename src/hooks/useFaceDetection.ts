import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import Webcam from 'react-webcam';

export const useFaceDetection = (
  captureThreshold = 5,
  onPhotoCapture: (photo: string) => void,
) => {
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState<string>('กำลังเริ่มต้นระบบ...');
  const webcamRef = useRef<Webcam>(null);
  const faceDetectionCount = useRef(0);
  const [faceDetectionCountState, setFaceDetectionCountState] = useState(0);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const modelLoadingTimeout = useRef<NodeJS.Timeout | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  // Check camera permission and load model afterward
  useEffect(() => {
    const checkCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (stream) {
          setHasCameraPermission(true);
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch (error) {
        setMessage('ไม่สามารถเปิดกล้องได้');
      }
    };

    checkCameraPermission();
  }, []);

  // Load the model after camera permission is granted
  useEffect(() => {
    if (!hasCameraPermission) return;

    let retryCount = 0;
    const MAX_RETRIES = 3;
    const TIMEOUT_MS = 20000; // Increased timeout to 20 seconds
    let isMounted = true;

    const initializeModel = async () => {
      try {
        if (detectionIntervalRef.current)
          clearInterval(detectionIntervalRef.current);
        if (modelLoadingTimeout.current)
          clearTimeout(modelLoadingTimeout.current);

        modelLoadingTimeout.current = setTimeout(() => {
          if (isMounted && isModelLoading) {
            throw new Error('Model loading timeout');
          }
        }, TIMEOUT_MS);

        await tf.setBackend('webgl');
        await tf.ready();

        const modelConfig = {
          runtime: 'tfjs' as const,
          modelType: 'short' as const,
          maxFaces: 1,
          scoreThreshold: 0.5,
          iouThreshold: 0.3,
        };

        const detector = await faceDetection.createDetector(
          faceDetection.SupportedModels.MediaPipeFaceDetector,
          modelConfig,
        );

        if (!detector) {
          throw new Error('Failed to create detector');
        }

        const testImg = new Image(100, 100);
        await detector.estimateFaces(testImg).catch(() => {
          throw new Error('Model validation failed');
        });

        if (isMounted) {
          clearTimeout(modelLoadingTimeout.current!);
          setModel(detector);
          setIsModelLoading(false);
          setMessage('กรุณาวางใบหน้าให้อยู่ในกรอบ');
        }
      } catch (error) {
        if (!isMounted) return;

        if (retryCount < MAX_RETRIES) {
          retryCount++;
          setMessage(`กำลังลองใหม่... (${retryCount}/${MAX_RETRIES})`);
          setTimeout(initializeModel, 1000);
          return;
        }

        setIsModelLoading(false);
        setMessage('ไม่สามารถโหลดระบบตรวจจับใบหน้าได้');

        try {
          await tf.setBackend('cpu');
          await tf.ready();
          const cpuDetector = await faceDetection.createDetector(
            faceDetection.SupportedModels.MediaPipeFaceDetector,
            { runtime: 'tfjs', modelType: 'short' },
          );
          if (cpuDetector && isMounted) {
            setModel(cpuDetector);
            setIsModelLoading(false);
            setMessage('กรุณาวางใบหน้าให้อยู่ในกรอบ');
          }
        } catch (cpuError) {
          if (isMounted) {
            setMessage('ไม่สามารถโหลดระบบตรวจจับใบหน้าได้');
          }
        }
      }
    };

    initializeModel();

    return () => {
      isMounted = false;
      if (detectionIntervalRef.current)
        clearInterval(detectionIntervalRef.current);
      if (modelLoadingTimeout.current)
        clearTimeout(modelLoadingTimeout.current);
    };
  }, [hasCameraPermission]);

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
        setTimeout(() => reject(new Error('Image load timeout')), 3000);
      });

      const detections = await model.estimateFaces(img, {
        flipHorizontal: false,
      });

      if (detections && detections.length > 0) {
        setFaceDetected(true);
        faceDetectionCount.current += 1;
        setFaceDetectionCountState(faceDetectionCount.current);
        setMessage('ตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...');

        if (faceDetectionCount.current >= captureThreshold) {
          onPhotoCapture(imageSrc);
          setMessage('บันทึกภาพสำเร็จ');
          if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
          }
        }
      } else {
        setFaceDetected(false);
        faceDetectionCount.current = 0;
        setFaceDetectionCountState(0);
        setMessage('ไม่พบใบหน้า กรุณาวางใบหน้าให้อยู่ในกรอบ');
      }
    } catch (error) {
      faceDetectionCount.current = 0;
      setFaceDetectionCountState(0);
    }
  }, [model, captureThreshold, onPhotoCapture]);

  const startDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    if (model && !isModelLoading) {
      detectionIntervalRef.current = setInterval(detectFace, 500);
    }
  }, [detectFace, model, isModelLoading]);

  const resetDetection = useCallback(() => {
    faceDetectionCount.current = 0;
    setFaceDetectionCountState(0);
    setFaceDetected(false);
    startDetection();
  }, [startDetection]);

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
