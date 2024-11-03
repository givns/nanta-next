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
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [tfBackendReady, setTfBackendReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const faceDetectionCount = useRef(0);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [faceDetectionCountState, setFaceDetectionCountState] = useState(0);

  // Load TF backend first
  useEffect(() => {
    const initializeTF = async () => {
      try {
        console.log('Initializing TensorFlow backend...');
        await tf.ready();
        console.log('TensorFlow backend ready, backend:', tf.getBackend());
        setTfBackendReady(true);
      } catch (error) {
        console.error('Error initializing TensorFlow:', error);
        setLoadingError('Failed to initialize TensorFlow backend');
        setIsModelLoading(false);
      }
    };
    initializeTF();
  }, []);

  // Load face detection model after TF is ready
  useEffect(() => {
    const loadModel = async () => {
      if (!tfBackendReady) return;

      try {
        console.log('Loading face detection model...');
        const modelConfig = {
          runtime: 'tfjs' as const,
          modelType: 'short' as const,
        };
        console.log('Model configuration:', modelConfig);

        const loadedModel = await faceDetection.createDetector(
          faceDetection.SupportedModels.MediaPipeFaceDetector,
          modelConfig,
        );

        console.log('Face detection model loaded successfully');
        setModel(loadedModel);
        setIsModelLoading(false);
      } catch (error) {
        console.error('Error loading face detection model:', error);
        setLoadingError('Failed to load face detection model');
        setIsModelLoading(false);
      }
    };

    if (tfBackendReady) {
      loadModel();
    }
  }, [tfBackendReady]);

  // Monitor webcam initialization
  useEffect(() => {
    if (webcamRef.current) {
      console.log('Webcam ref initialized');
    }
  }, [webcamRef.current]);

  const capturePhoto = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setPhoto(imageSrc);
      onPhotoCapture(imageSrc);
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      return imageSrc;
    }
    return null;
  }, [onPhotoCapture]);

  const detectFace = useCallback(async () => {
    if (!webcamRef.current || !model) {
      console.log('Skipping face detection:', {
        hasWebcam: !!webcamRef.current,
        hasModel: !!model,
      });
      return;
    }

    try {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) {
        console.log('No image captured from webcam');
        return;
      }

      const img = new Image();
      img.src = imageSrc;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      console.log('Running face detection on captured image');
      const detections = await model.estimateFaces(img, {
        flipHorizontal: false,
      });

      console.log('Face detection result:', {
        facesFound: detections.length,
        currentCount: faceDetectionCount.current,
      });

      if (detections.length > 0) {
        setFaceDetected(true);
        faceDetectionCount.current += 1;
        setFaceDetectionCountState(faceDetectionCount.current);
        setMessage('ระบบตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...');

        if (faceDetectionCount.current >= captureThreshold) {
          capturePhoto();
          setMessage('ระบบบันทึกรูปภาพแล้ว');
        }
      } else {
        setFaceDetected(false);
        faceDetectionCount.current = 0;
        setFaceDetectionCountState(faceDetectionCount.current);
        setMessage('ไม่พบใบหน้าของพนักงาน..');
      }
    } catch (error) {
      console.error('Error in face detection:', error);
    }
  }, [model, captureThreshold, capturePhoto]);

  const startDetection = useCallback(() => {
    if (!isModelLoading && !photo) {
      detectionIntervalRef.current = setInterval(detectFace, 500);
    }
  }, [detectFace, isModelLoading, photo]);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
  }, []);

  useEffect(() => {
    startDetection();
    return () => stopDetection();
  }, [startDetection, stopDetection]);

  const resetDetection = useCallback(() => {
    setPhoto(null);
    setFaceDetected(false);
    faceDetectionCount.current = 0;
    stopDetection();
    startDetection();
  }, [stopDetection, startDetection]);

  return {
    webcamRef,
    isModelLoading,
    loadingError,
    faceDetected,
    faceDetectionCount: faceDetectionCountState,
    photo,
    setPhoto,
    message,
    resetDetection,
    captureThreshold,
    tfBackendReady,
  };
};
